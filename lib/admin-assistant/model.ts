import { collapseDuplicateTextDeltas } from "@/lib/assistant/model";

// ---------------------------------------------------------------------------
// Solenne admin assistant — model wiring.
//
// ONE place names the Workers AI model. Swapping providers/models is a one-line
// change here; nothing else in lib/admin-assistant or the route hard-codes a
// model id.
//
// Findings (workers-ai-provider@3.3.1 + ai@6.0.312):
//   - `@cf/meta/llama-3.3-70b-instruct-fp8-fast` is the same 24k-context model
//     the storefront concierge uses. The provider maps `tools` /
//     `tool_choice` onto the Workers AI request and parses both
//     `tool_calls` and the OpenAI-style `choices[0].message.tool_calls`
//     shapes. It also salvages a tool call that the model leaked as raw JSON
//     into `content` (parseLeakedToolCalls), which makes smaller Llama models
//     usable for tool loops.
//   - Streaming is supported: the provider emits tool-call deltas and the AI
//     SDK assembles them before `execute()` runs.
//   - The duplicate-text-chunk workaround is still needed for this model
//     (every text token arrives twice in one SSE frame). It is applied with
//     `experimental_transform` and touches ONLY `text-delta` parts; every
//     tool-call / tool-result / step part passes through untouched. See
//     lib/assistant/model.ts for the implementation.
//
// Keep the step budget small: each step is a full model round trip and the
// drawer is interactive, not a batch job.
// ---------------------------------------------------------------------------

export const ADMIN_ASSISTANT_MODEL_ID =
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Maximum tool-calling rounds per request (initial call + 4 tool loops). */
export const ADMIN_ASSISTANT_MAX_STEPS = 5;

/** Short operational answers; leaves headroom for tool-call JSON. */
export const ADMIN_ASSISTANT_MAX_OUTPUT_TOKENS = 600;

/** Only the tail of the conversation is sent upstream. */
export const ADMIN_ASSISTANT_MAX_HISTORY_MESSAGES = 12;

/** Upper bound on retained conversation text, in characters. */
export const ADMIN_ASSISTANT_MAX_INPUT_CHARACTERS = 6000;

export { collapseDuplicateTextDeltas };
