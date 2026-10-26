import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

// ---------------------------------------------------------------------------
// Duplicate text-delta collapse for the Workers AI stream.
//
// `@cf/meta/llama-3.3-70b-instruct-fp8-fast` emits every token twice in the
// same SSE frame — once in the legacy `response` field and once in the
// OpenAI-style `choices[0].delta.content`. `workers-ai-provider@3` forwards
// both formats, so the raw stream looks like:
//
//     t1 t1 t2 t2 t3 t3 …
//
// The frame boundary is not visible to an AI SDK transform (it receives
// decoded parts, not SSE frames), so the duplication has to be detected from
// the parts themselves.
//
// WHY NOT "drop a chunk identical to the previous one":
// that rule silently corrupts a stream that is NOT duplicated. Legitimate text
// such as "000", "00.00" or a repeated date token can arrive as two adjacent
// identical chunks, and the old rule would delete one of them — changing
// "$1,100,000" or an order number. Parity-based halving has the same flaw: it
// assumes the stream starts on a pair boundary forever.
//
// WHAT THIS DOES INSTEAD
//   1. Buffer the first four text deltas. Only when they form two consecutive
//      identical pairs (`a a b b`, same text id) is the stream declared
//      duplicated. Anything else flips to pass-through and every chunk is
//      forwarded unchanged.
//      A block that ends before those four chunks arrive is judged as a whole:
//      if every chunk in it pairs with its neighbour, it is a doubled short
//      reply ("Yes." → two chunks) and is collapsed; otherwise it is forwarded
//      untouched.
//   2. In duplicated mode a chunk is dropped ONLY when the very next chunk is
//      byte-identical (same id + same text). A lone, unpaired chunk is always
//      forwarded, so a number can never lose a digit to parity drift.
//   3. Non-text parts (tool calls, tool results, step markers, text-start /
//      text-end) are never dropped, reordered or merged; they flush whatever is
//      buffered, in order, and pass through untouched.
//
// The one ambiguity that cannot be resolved from decoded parts is a stream that
// is NOT doubled but whose first four chunks are two byte-identical pairs. This
// provider doubles every frame, so a run like that can only be a doubled token
// run — which is exactly what should be collapsed.
//
// A text block always begins on a pair boundary, so a change of text id also
// flushes the lookahead and restarts pairing.
// ---------------------------------------------------------------------------

type Part = TextStreamPart<ToolSet>;
type TextDelta = Extract<Part, { type: "text-delta" }>;

/** Two identical pairs are required before the stream is treated as doubled. */
const DETECTION_CHUNKS = 4;

function isTextDelta(part: Part): part is TextDelta {
  return part.type === "text-delta";
}

function sameChunk(a: TextDelta, b: TextDelta): boolean {
  return a.id === b.id && a.text === b.text;
}

export function collapseDuplicateTextDeltas(): StreamTextTransform<ToolSet> {
  return () => {
    let mode: "undecided" | "duplicated" | "plain" = "undecided";

    /** Detection buffer — emitted unchanged unless duplication is proven. */
    let pending: TextDelta[] = [];

    /** Duplicated mode: the chunk waiting for its twin. */
    let held: TextDelta | null = null;

    /** Text block the pairing belongs to. */
    let blockId: string | null = null;

    const flushPending = (
      controller: TransformStreamDefaultController<Part>
    ) => {
      for (const part of pending) controller.enqueue(part);
      pending = [];
    };

    /**
     * A text block that ended before the four-chunk probe completed. If every
     * chunk in the (complete) block pairs with its neighbour, the block is a
     * doubled one-token/short reply and is collapsed; otherwise it is forwarded
     * untouched and the stream is treated as plain from then on.
     */
    const resolvePending = (
      controller: TransformStreamDefaultController<Part>
    ) => {
      if (mode !== "undecided" || pending.length === 0) {
        flushPending(controller);
        return;
      }

      const buffered = pending;
      pending = [];

      const pairable =
        buffered.length >= 2 &&
        buffered.length % 2 === 0 &&
        buffered.every((part, index) =>
          index % 2 === 1 ? sameChunk(buffered[index - 1], part) : true
        );

      if (!pairable) {
        mode = "plain";
        for (const part of buffered) controller.enqueue(part);
        return;
      }

      mode = "duplicated";
      for (const part of buffered) acceptPaired(part, controller);
    };

    const flushHeld = (controller: TransformStreamDefaultController<Part>) => {
      if (held !== null) {
        controller.enqueue(held);
        held = null;
      }
    };

    /** Duplicated mode: keep one of each identical adjacent pair. */
    const acceptPaired = (
      part: TextDelta,
      controller: TransformStreamDefaultController<Part>
    ) => {
      if (blockId !== part.id) {
        // A new text block starts a new pair sequence.
        flushHeld(controller);
        blockId = part.id;
        held = part;
        return;
      }

      if (held === null) {
        held = part;
        return;
      }

      if (sameChunk(held, part)) {
        controller.enqueue(held);
        held = null;
        return;
      }

      // Not a twin: forward it and hold the newcomer. Nothing is lost even if
      // the provider stops doubling mid-stream.
      controller.enqueue(held);
      held = part;
    };

    return new TransformStream<Part, Part>({
      transform(part, controller) {
        if (isTextDelta(part)) {
          if (mode === "plain") {
            controller.enqueue(part);
            return;
          }

          if (mode === "undecided") {
            pending.push(part);

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
              for (const chunk of buffered) controller.enqueue(chunk);
              return;
            }

            mode = "duplicated";
            for (const chunk of buffered) acceptPaired(chunk, controller);
            return;
          }

          acceptPaired(part, controller);
          return;
        }

        // Every non-text part is preserved verbatim. Flush in order first so
        // the text a consumer already saw keeps its position.
        resolvePending(controller);
        if (mode === "duplicated") flushHeld(controller);
        controller.enqueue(part);
      },

      flush(controller) {
        resolvePending(controller);
        flushHeld(controller);
      },
    });
  };
}
