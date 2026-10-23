import type { StreamTextTransform, ToolSet } from "ai";

/**
 * Collapses the duplicated text chunks the Workers AI stream produces for
 * Llama 3.3.
 *
 * `@cf/meta/llama-3.3-70b-instruct-fp8-fast` emits every token twice in the
 * same SSE frame — once in the legacy `response` field and once in the
 * OpenAI-style `choices[0].delta.content`. `workers-ai-provider@3` forwards
 * both formats, so the assistant would otherwise repeat every phrase.
 *
 * The transform drops a text chunk that is byte-identical to the chunk
 * immediately before it (same text id, same text). The pair is consumed, so a
 * genuinely repeated token later in the sentence still survives.
 */
export function collapseDuplicateTextDeltas(): StreamTextTransform<ToolSet> {
  return () => {
    let previous: { id: string; text: string } | null = null;

    return new TransformStream({
      transform(part, controller) {
        if (part.type === "text-delta") {
          if (
            previous &&
            previous.id === part.id &&
            previous.text === part.text
          ) {
            previous = null;
            return;
          }

          previous = { id: part.id, text: part.text };
          controller.enqueue(part);
          return;
        }

        if (part.type !== "text-start" && part.type !== "text-end") {
          previous = null;
        }

        controller.enqueue(part);
      },
    });
  };
}
