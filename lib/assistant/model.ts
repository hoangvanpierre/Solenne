import type {
  LanguageModelMiddleware,
  StreamTextTransform,
  TextStreamPart,
  ToolSet,
} from "ai";

// ---------------------------------------------------------------------------
// Duplicate-delta collapse for the Workers AI stream.
//
// `@cf/meta/llama-3.3-70b-instruct-fp8-fast` sends every token twice in the
// SAME SSE frame: once in the legacy `response` field and once in the
// OpenAI-style `choices[0].delta.content`. `workers-ai-provider@3` forwards
// both formats (see its `getMappedStream`), so the decoded stream looks like:
//
//     t1 t1 t2 t2 t3 t3 …
//
// The same doubling hits TOOL-CALL ARGUMENTS: a frame carrying both
// `tool_calls` and `choices[0].delta.tool_calls` makes the provider call
// `emitToolCallDeltas` twice, so the argument run arrives as
// `{"range": "`, `{"range": "`, `today"}`, `today"}`. Concatenated, that is
// `{"range": "{"range": "today"}today"}` — invalid JSON, so the tool never
// runs and the model retries the same broken call until the step budget ends.
//
// WHY THERE ARE TWO ENTRY POINTS
// The AI SDK applies `experimental_transform` (streamText level) AFTER
// `runToolsTransformation` has already assembled tool calls, so at that layer
// `tool-input-delta` parts no longer exist — only the finished, corrupted
// `tool-call`. Text deltas ARE visible there, which is why the original
// text-only transform worked. Tool arguments therefore have to be repaired one
// layer lower, at the language-model boundary (`wrapLanguageModel` →
// `wrapStream`), where the provider's deltas are still intact:
//
//   collapseDuplicateTextDeltas()        — streamText transform, text-delta
//   collapseDuplicateToolInputDeltas()   — model middleware, tool-input-delta
//
// Both use the same pairing state machine, so the guarantees below hold for
// both.
//
// WHY NOT "drop a chunk identical to the previous one":
// that rule silently corrupts a stream that is NOT duplicated. Legitimate text
// such as "000", "00.00" or a repeated date token can arrive as two adjacent
// identical chunks, and the old rule would delete one of them — changing
// "$1,100,000" or an order number. Parity-based halving has the same flaw: it
// assumes the stream starts on a pair boundary forever.
//
// WHAT THIS DOES INSTEAD
//   1. Buffer the first four deltas. Only when they form two consecutive
//      identical pairs (`a a b b`, same id) is the stream declared duplicated.
//      Anything else flips to pass-through and every chunk is forwarded
//      unchanged.
//      A block that ends before those four chunks arrive is judged as a whole:
//      if every chunk in it pairs with its neighbour, it is a doubled short
//      reply ("Yes." → two chunks) and is collapsed; otherwise it is forwarded
//      untouched.
//   2. In duplicated mode a chunk is dropped ONLY when the very next chunk is
//      byte-identical (same id + same text). A lone, unpaired chunk is always
//      forwarded, so a number can never lose a digit to parity drift.
//   3. Non-delta parts (tool calls, tool results, step markers, text-start /
//      text-end) are never dropped, reordered or merged; they flush whatever is
//      buffered, in order, and pass through untouched.
//
// The one ambiguity that cannot be resolved from decoded parts is a stream that
// is NOT doubled but whose first four chunks are two byte-identical pairs. This
// provider doubles every frame, so a run like that can only be a doubled token
// run — which is exactly what should be collapsed.
//
// A delta block always begins on a pair boundary, so a change of id also
// flushes the lookahead and restarts pairing. Tool-call arguments are paired
// per tool-call id, so parallel calls cannot borrow each other's lookahead.
// ---------------------------------------------------------------------------

/** Two identical pairs are required before the stream is treated as doubled. */
const DETECTION_CHUNKS = 4;

/**
 * The pairing state machine is part-agnostic: it only compares `id` + `text`
 * and re-emits the original object. Each entry point narrows the part type at
 * its own boundary.
 */
interface Chunk {
  /** Block id: a text block id, or a tool-call id. */
  id: string;
  /** The delta text compared for duplication. */
  text: string;
  /** The original part, enqueued unchanged when it survives. */
  part: unknown;
}

type Emit = (part: unknown) => void;

/**
 * One independent pairing state machine. Text blocks and each tool call get
 * their own instance, so a plain text stream cannot mask a doubled argument
 * stream (or the reverse).
 */
function createPairCollapser() {
  let mode: "undecided" | "duplicated" | "plain" = "undecided";

  /** Detection buffer — emitted unchanged unless duplication is proven. */
  let pending: Chunk[] = [];

  /** Duplicated mode: the chunk waiting for its twin. */
  let held: Chunk | null = null;

  /** Delta block the pairing belongs to. */
  let blockId: string | null = null;

  const sameChunk = (a: Chunk, b: Chunk) => a.id === b.id && a.text === b.text;

  const flushPending = (emit: Emit) => {
    for (const chunk of pending) emit(chunk.part);
    pending = [];
  };

  const flushHeld = (emit: Emit) => {
    if (held !== null) {
      emit(held.part);
      held = null;
    }
  };

  /** Duplicated mode: keep one of each identical adjacent pair. */
  const acceptPaired = (chunk: Chunk, emit: Emit) => {
    if (blockId !== chunk.id) {
      // A new block starts a new pair sequence.
      flushHeld(emit);
      blockId = chunk.id;
      held = chunk;
      return;
    }

    if (held === null) {
      held = chunk;
      return;
    }

    if (sameChunk(held, chunk)) {
      emit(held.part);
      held = null;
      return;
    }

    // Not a twin: forward it and hold the newcomer. Nothing is lost even if
    // the provider stops doubling mid-stream.
    emit(held.part);
    held = chunk;
  };

  /**
   * A block that ended before the four-chunk probe completed. If every chunk in
   * the (complete) block pairs with its neighbour, the block is a doubled
   * one-token/short run and is collapsed; otherwise it is forwarded untouched
   * and the stream is treated as plain from then on.
   */
  const resolvePending = (emit: Emit) => {
    if (mode !== "undecided" || pending.length === 0) {
      flushPending(emit);
      return;
    }

    const buffered = pending;
    pending = [];

    const pairable =
      buffered.length >= 2 &&
      buffered.length % 2 === 0 &&
      buffered.every((chunk, index) =>
        index % 2 === 1 ? sameChunk(buffered[index - 1], chunk) : true
      );

    if (!pairable) {
      mode = "plain";
      for (const chunk of buffered) emit(chunk.part);
      return;
    }

    mode = "duplicated";
    for (const chunk of buffered) acceptPaired(chunk, emit);
  };

  return {
    push(chunk: Chunk, emit: Emit) {
      if (mode === "plain") {
        emit(chunk.part);
        return;
      }

      if (mode === "undecided") {
        pending.push(chunk);

        if (pending.length < DETECTION_CHUNKS) return;

        const [first, second, third, fourth] = pending;
        const duplicated =
          first.id === second.id &&
          first.text === second.text &&
          third.id === fourth.id &&
          third.text === fourth.text;

        const buffered = pending;
        pending = [];

        if (!duplicated) {
          mode = "plain";
          for (const chunk of buffered) emit(chunk.part);
          return;
        }

        mode = "duplicated";
        for (const chunk of buffered) acceptPaired(chunk, emit);
        return;
      }

      acceptPaired(chunk, emit);
    },

    /** The block is over: decide the probe, then release the held twin. */
    end(emit: Emit) {
      resolvePending(emit);
      flushHeld(emit);
    },
  };
}

type Part = TextStreamPart<ToolSet>;

/**
 * Collapses the doubled `text-delta` run of a streamText result.
 *
 * Only `text-delta` is inspected. Every other part (tool calls, tool results,
 * step markers, text-start/text-end) is forwarded untouched, in order.
 */
export function collapseDuplicateTextDeltas(): StreamTextTransform<ToolSet> {
  return () => {
    const text = createPairCollapser();

    return new TransformStream<Part, Part>({
      transform(part, controller) {
        const emit: Emit = (value) => controller.enqueue(value as Part);

        if (part.type === "text-delta") {
          text.push({ id: part.id, text: part.text, part }, emit);
          return;
        }

        // Any non-text part ends the current text block. Flush first so the
        // content a consumer already saw keeps its position.
        text.end(emit);
        controller.enqueue(part);
      },

      flush(controller) {
        text.end((value) => controller.enqueue(value as Part));
      },
    });
  };
}

/** The provider-level stream part shape this middleware cares about. */
type ModelStreamPart = { type: string } & Record<string, unknown>;

function toolInputOf(
  part: ModelStreamPart
): { id: string; delta: string } | null {
  if (part.type !== "tool-input-delta") return null;

  const { id, delta } = part;
  if (typeof id !== "string" || typeof delta !== "string") return null;

  return { id, delta };
}

/**
 * Collapses the doubled `tool-input-delta` run of the provider stream.
 *
 * This MUST wrap the language model, not the streamText result: by the time
 * `experimental_transform` runs, the AI SDK has already assembled the tool
 * arguments, so the deltas are gone and the damage is done.
 *
 * TWO THINGS ARE DOUBLED, AND BOTH HAVE TO BE FIXED
 * The provider accumulates arguments itself while streaming (`active.args +=
 * delta` in `emitToolCallDeltas`, once per format), so it emits:
 *
 *   tool-input-delta  '{"range": "'   (×2)
 *   tool-input-delta  'today"}'       (×2)
 *   tool-call         input: '{"range": "{"range": "today"}today"}'
 *
 * Deduping only the deltas still leaves a corrupted `tool-call.input`, because
 * the SDK uses that field verbatim. So the deltas are collapsed AND the
 * assembled `input` is rebuilt from the collapsed deltas. When the two copies
 * are not byte-identical (`{"limit":10}{"limit": 10}` — the provider appends
 * `JSON.stringify` output once and the model's raw text once), byte pairing
 * cannot see it, so `repairDoubledJson()` keeps the first complete JSON value
 * instead. `input` is only ever replaced with something that parses, so a
 * stream this middleware mis-reads can never make things worse.
 *
 * One state entry per tool-call id; everything is dropped on `tool-call`,
 * `finish` or a new `stream-start` so nothing leaks into the next step. Every
 * other part passes through untouched.
 */
export function collapseDuplicateToolInputDeltas(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    wrapStream: async ({ doStream }) => {
      const result = await doStream();

      interface CallState {
        collapser: ReturnType<typeof createPairCollapser>;
        /** Argument text rebuilt from the COLLAPSED deltas. */
        text: string;
      }

      const calls = new Map<string, CallState>();

      const stateFor = (id: string): CallState => {
        let state = calls.get(id);
        if (!state) {
          state = { collapser: createPairCollapser(), text: "" };
          calls.set(id, state);
        }
        return state;
      };

      /**
       * An emitter bound to one call: records the collapsed delta text and
       * forwards the part. Used for BOTH `push` and `end`, because a short run
       * is flushed by `end` and would otherwise never reach `text`.
       */
      const emitterFor = (state: CallState, emit: Emit): Emit => (value) => {
        const part = value as { delta?: unknown };
        if (typeof part.delta === "string") state.text += part.delta;
        emit(value);
      };

      const endAll = (emit: Emit) => {
        for (const state of calls.values()) {
          state.collapser.end(emitterFor(state, emit));
        }
        calls.clear();
      };

      const stream = (
        result.stream as unknown as ReadableStream<ModelStreamPart>
      ).pipeThrough(
        new TransformStream<ModelStreamPart, ModelStreamPart>({
          transform(part, controller) {
            const emit: Emit = (value) =>
              controller.enqueue(value as ModelStreamPart);

            const input = toolInputOf(part);
            if (input !== null) {
              const state = stateFor(input.id);
              state.collapser.push(
                { id: input.id, text: input.delta, part },
                emitterFor(state, emit)
              );
              return;
            }

            if (part.type === "tool-call") {
              const id =
                typeof part.toolCallId === "string" ? part.toolCallId : null;
              const state = id === null ? undefined : calls.get(id);

              if (id !== null && state) {
                state.collapser.end(emitterFor(state, emit));
                calls.delete(id);

                // Prefer the rebuilt arguments when they are usable JSON.
                const repaired =
                  state.text.length > 0 ? repairDoubledJson(state.text) : null;

                if (repaired !== null) {
                  controller.enqueue({ ...part, input: repaired });
                  return;
                }
              }

              controller.enqueue(part);
              return;
            }

            if (part.type === "finish" || part.type === "stream-start") {
              endAll(emit);
            } else if (part.type === "tool-input-start") {
              const id = typeof part.id === "string" ? part.id : null;
              const state = id === null ? undefined : calls.get(id);
              if (state) state.collapser.end(emitterFor(state, emit));
              if (id !== null) calls.delete(id);
            } else if (part.type === "tool-input-end") {
              const id = typeof part.id === "string" ? part.id : null;
              const state = id === null ? undefined : calls.get(id);
              // Keep `text` — the assembled `tool-call` arrives next.
              if (state) state.collapser.end(emitterFor(state, emit));
            }

            controller.enqueue(part);
          },

          flush(controller) {
            endAll((value) => controller.enqueue(value as ModelStreamPart));
          },
        })
      );

      return { ...result, stream } as unknown as typeof result;
    },
  };
}

/** True when `text` parses to a JSON object or array. */
function isJsonObject(text: string): boolean {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

/**
 * Index just past the first complete JSON object/array in `text`, or -1 when
 * the value never closes. String contents and escapes are respected.
 */
function firstJsonValueEnd(text: string): number {
  const open = text[0];
  if (open !== "{" && open !== "[") return -1;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }

  return -1;
}

/**
 * The provider's tool arguments can arrive as two concatenated JSON values
 * (`{"limit":10}{"limit": 10}`) because it appends the same call once per wire
 * format and the two serialisations are not always byte-identical — one is
 * compact JSON from `JSON.stringify`, the other is the model's raw text. Byte
 * pairing cannot see that, so the assembled value is repaired here by keeping
 * the first complete JSON value when the whole string is not valid JSON.
 *
 * Returns null when nothing usable can be recovered, in which case the original
 * (possibly invalid) input is left alone.
 */
function repairDoubledJson(text: string): string | null {
  if (isJsonObject(text)) return text;

  const end = firstJsonValueEnd(text);
  if (end > 0) {
    const head = text.slice(0, end);
    if (isJsonObject(head)) return head;
  }

  return null;
}
