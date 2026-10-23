import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { buildSystemPrompt, type AssistantLocale } from "@/lib/assistant/context";
import { collapseDuplicateTextDeltas } from "@/lib/assistant/model";

/**
 * Workers AI model id â€” verified in the Cloudflare Workers AI catalogue:
 * `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (24k context, fp8, streaming).
 * Change it here only; nothing else in the app hard-codes a model.
 */
const MODEL_ID = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Only the tail of the conversation is sent upstream â€” keeps prompts small and cheap. */
const MAX_HISTORY_MESSAGES = 12;

/** Room for a short concierge reply; the persona asks for 2-4 sentences. */
const MAX_OUTPUT_TOKENS = 400;

/** Upper bound on the text the client may send in the retained window. */
const MAX_INPUT_CHARACTERS = 4000;

/** Used when the edge does not supply a client address (local dev, some proxies). */
const UNKNOWN_CLIENT_IP = "unknown";

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function conversationTooLong() {
  return Response.json(
    {
      error:
        "This conversation is too long. Please start a new one to keep chatting.",
    },
    { status: 413 }
  );
}

function tooManyRequests() {
  return Response.json(
    { error: "Too many messages. Please wait a moment and try again." },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}

/** Character count of the text parts of a UI message; tolerates malformed input. */
function textLengthOf(message: UIMessage): number {
  if (!Array.isArray(message.parts)) return 0;

  return message.parts.reduce(
    (total, part) => (part.type === "text" ? total + part.text.length : total),
    0
  );
}

async function resolveLocale(requested: unknown): Promise<AssistantLocale> {
  if (requested === "vi" || requested === "en") return requested;

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale === "vi" || cookieLocale === "en") return cookieLocale;

  return "en";
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const body = payload as { messages?: unknown; locale?: unknown } | null;
  const messages = body?.messages;

  if (!Array.isArray(messages)) {
    return badRequest("`messages` must be an array.");
  }

  if (messages.length === 0) {
    return badRequest("`messages` must contain at least one message.");
  }

  const history = messages.slice(-MAX_HISTORY_MESSAGES) as UIMessage[];

  const inputCharacters = history.reduce(
    (total, message) => total + textLengthOf(message),
    0
  );
  if (inputCharacters > MAX_INPUT_CHARACTERS) {
    return conversationTooLong();
  }

  // The AI binding is injected by the Workers runtime; no API key is involved.
  try {
    const { env } = await getCloudflareContext({ async: true });

    // Cloudflare's rate limiting binding: 10 requests / 60s per client IP,
    // counted per Cloudflare location (the platform's documented behaviour).
    // An IP is shared by offices and mobile carriers, so this is a coarse
    // anti-abuse valve rather than a per-person quota.
    const clientIp =
      request.headers.get("cf-connecting-ip")?.trim() || UNKNOWN_CLIENT_IP;
    const limiter = env.CHAT_RATE_LIMITER;
    if (limiter) {
      const { success } = await limiter.limit({ key: `chat:${clientIp}` });
      if (!success) return tooManyRequests();
    }

    const workersai = createWorkersAI({ binding: env.AI });
    const modelMessages = await convertToModelMessages(history);
    const system = await buildSystemPrompt(await resolveLocale(body?.locale));

    const result = streamText({
      model: workersai(MODEL_ID),
      system,
      messages: modelMessages,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      experimental_transform: collapseDuplicateTextDeltas(),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[assistant] chat request failed", error);
    return Response.json(
      { error: "The assistant is unavailable right now." },
      { status: 500 }
    );
  }
}
