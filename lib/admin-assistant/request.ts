import type { UIMessage } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Solenne admin assistant — the POST /api/admin-assistant request contract.
//
// Lives here rather than inline in the route so scripts/verify-admin-assistant
// .mjs can exercise the REAL schema instead of a copy. That matters: this file
// is where a shape mismatch between the AI SDK's chat transport and the route
// turns into an opaque 400.
//
// THE BUG THIS ENCODES (fixed in Phase 2):
// `DefaultChatTransport` (ai@6) does not POST `{ messages }` — it posts
//
//   { ...body, id, messages, trigger, messageId }
//
// where `id` is the chat id, `messageId` the id of the message just sent, and
// `trigger` is "submit-message" or "regenerate-message". The route's schema was
// `.strict()`, so every send failed validation with
// `unrecognized_keys: ["id", "trigger", "messageId"]` and answered 400. The
// drawer maps 400 to "That request could not be read. Please try again.", which
// is exactly what an operator saw — no message ever reached the model.
//
// The envelope keys are declared (and therefore accepted) but deliberately NOT
// read: authorization and tool input never depend on them.
//
// Everything here is pure zod. No database, no network, no `@/` runtime imports
// beyond the alias itself, so the static harness can load it with Node's type
// stripping.
// ---------------------------------------------------------------------------

/** Envelope keys the AI SDK chat transport adds to the POST body. Unused. */
export const CHAT_TRANSPORT_ENVELOPE_KEYS = [
  "id",
  "trigger",
  "messageId",
] as const;

/** One part of a UI message. Text parts are bounded; others pass through. */
const messagePartSchema = z
  .object({
    type: z.string().max(40),
    text: z.string().max(4000).optional(),
  })
  .passthrough();

export const uiMessageSchema = z
  .object({
    id: z.string().max(120).optional(),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(messagePartSchema).max(80),
  })
  .passthrough();

/**
 * The page hint. `strict` on purpose: it is rendered into the prompt, so an
 * unexpected key should fail loudly rather than be silently forwarded.
 */
export const contextSchema = z
  .object({
    path: z.string().trim().min(1).max(300),
    entity: z
      .object({
        type: z.enum(["order", "product", "customer"]),
        ref: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .regex(/^[A-Za-z0-9-]+$/, "Unsupported entity reference."),
      })
      .strict()
      .optional(),
  })
  .strict();

export const requestSchema = z
  .object({
    // Up to 50 are accepted so an older browser tab is not rejected outright;
    // only the last 12 are ever sent upstream.
    messages: z.array(uiMessageSchema).min(1).max(50),
    context: contextSchema.optional(),
    locale: z.enum(["en", "vi"]).optional(),

    // AI SDK transport envelope — see the header. Accepted, never read.
    id: z.string().max(120).optional(),
    trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
    messageId: z.string().max(120).optional(),
  })
  // Still strict about everything ELSE: an unknown top-level key is a bug in
  // the caller, not something to silently accept.
  .strict();

export type AdminAssistantRequest = z.infer<typeof requestSchema>;
export type AdminAssistantUiMessage = z.infer<typeof uiMessageSchema>;

/** Characters of text in one message. Tool output and files are not counted. */
export function textLengthOf(message: AdminAssistantUiMessage): number {
  return message.parts.reduce(
    (total, part) =>
      part.type === "text" && typeof part.text === "string"
        ? total + part.text.length
        : total,
    0
  );
}

/**
 * Keep only parts that convert cleanly into model messages: text and COMPLETED
 * tool calls. An interrupted tool call (no output) would make
 * convertToModelMessages() throw, which should be a client-side retry, not a
 * 500 on the next turn.
 *
 * A message left with no parts is dropped rather than rejected: the schema
 * allows an empty part list so a stale tab cannot wedge itself, and this is
 * where it stops mattering.
 */
export function toSafeHistory(messages: AdminAssistantUiMessage[]): UIMessage[] {
  return messages
    .map((message) => {
      const parts = message.parts.filter((part) => {
        if (part.type === "text") return true;

        if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
          const state = (part as { state?: string }).state;
          return state === "output-available" || state === "output-error";
        }

        return false;
      });

      return { ...message, parts } as unknown as UIMessage;
    })
    .filter((message) => message.parts.length > 0);
}
