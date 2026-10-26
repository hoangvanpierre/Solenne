import { wrapLanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import type { WorkersAISettings } from "workers-ai-provider";
import { collapseDuplicateToolInputDeltas } from "@/lib/assistant/model";
import { ADMIN_ASSISTANT_MODEL_ID } from "./model";

// ---------------------------------------------------------------------------
// Workers AI binding adapter — force ONE tool call per assistant turn.
//
// THE FAILURE THIS FIXES (observed live, 2026-10-26):
//
//   Step 1 asked for three tools at once (getOrderSummary, listOrders,
//   listLowStock). Workers AI ran all three, then rejected the FOLLOW-UP
//   request with
//
//     8007: {"error":{"message":"This model only supports single tool-calls
//           at once!","type":"BadRequestError","code":400}}
//
//   The second request echoes the assistant message that carried the three
//   `tool_calls`, and that model refuses to continue from such a message. The
//   operator saw the route's stream-error copy ("The assistant is unavailable
//   right now.") after two tools had already run.
//
// `workers-ai-provider@3.3.1` maps `tools` / `tool_choice` onto the request but
// never sends `parallel_tool_calls`, and the AI SDK has no provider-agnostic
// switch for it. Workers AI accepts the field on the chat `inputs` object, so
// the cheapest correct fix is to inject it at the binding boundary: every
// `run()` that carries `messages` gets `parallel_tool_calls: false`.
//
// Verified against the real `env.AI` binding: with the flag, a request that
// previously produced three calls in one step produces exactly one, and the
// loop advances step by step.
//
// This is a Proxy rather than a hand-built object so every other member of the
// binding (`autorag`, `aiSearch`, `toMarkdown`, future additions) is forwarded
// untouched, and `createWorkersAI`'s `isBinding` check (truthiness of
// `options.binding`) still sees a binding.
// ---------------------------------------------------------------------------

/** The `env.AI` binding, as the provider types it. */
export type WorkersAIBinding = NonNullable<WorkersAISettings["binding"]>;

type RunFn = (
  model: string,
  inputs: Record<string, unknown>,
  options?: unknown
) => unknown;

/** Chat requests carry `messages`; embeddings/audio/vision do not. */
function isChatInputs(inputs: unknown): inputs is Record<string, unknown> {
  return (
    inputs !== null &&
    typeof inputs === "object" &&
    !Array.isArray(inputs) &&
    "messages" in inputs
  );
}

/**
 * Returns a binding that is identical to `binding` except that chat requests
 * always set `parallel_tool_calls: false`.
 *
 * Only the admin assistant uses this: the storefront concierge calls the model
 * without tools, so the flag would be noise there.
 */
export function singleToolCallBinding(
  binding: WorkersAIBinding
): WorkersAIBinding {
  const run = (binding as unknown as { run: RunFn }).run.bind(binding);

  const wrappedRun: RunFn = (model, inputs, options) =>
    run(
      model,
      isChatInputs(inputs)
        ? { ...inputs, parallel_tool_calls: false }
        : inputs,
      options
    );

  return new Proxy(binding, {
    get(target, property) {
      if (property === "run") return wrappedRun;

      // Forward everything else as-is, keeping methods bound to the real
      // binding so host-object brand checks still pass.
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * The admin assistant's model, with both Workers AI quirks already handled:
 *
 *   - the binding forces one tool call per turn, and
 *   - the model middleware repairs the doubled tool-call arguments, which the
 *     streamText-level transform cannot reach.
 *
 * Prose deltas are still collapsed by `collapseDuplicateTextDeltas()` as an
 * `experimental_transform` in the route (that is the only layer where text
 * deltas are visible). Callers should not pass a different model id.
 */
export function createAdminAssistantModel(binding: WorkersAIBinding) {
  const workersai = createWorkersAI({
    binding: singleToolCallBinding(binding),
  });

  return wrapLanguageModel({
    model: workersai(ADMIN_ASSISTANT_MODEL_ID),
    middleware: collapseDuplicateToolInputDeltas(),
  });
}
