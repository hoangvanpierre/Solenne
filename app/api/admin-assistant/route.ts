import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type StreamTextTransform,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";
import { AuthError, requireAnyPermission } from "@/lib/authz";
import { MANAGEMENT_PERMISSIONS } from "@/lib/redirect";
import {
  ADMIN_ASSISTANT_MAX_HISTORY_MESSAGES,
  ADMIN_ASSISTANT_MAX_INPUT_CHARACTERS,
  ADMIN_ASSISTANT_MAX_OUTPUT_TOKENS,
  ADMIN_ASSISTANT_MAX_STEPS,
  ADMIN_ASSISTANT_MODEL_ID,
  collapseDuplicateTextDeltas,
} from "@/lib/admin-assistant/model";
import { buildAdminAssistantSystemPrompt } from "@/lib/admin-assistant/prompt";
import {
  createAdminAssistantTools,
  promptToolSummaries,
} from "@/lib/admin-assistant/tools";
import type { AssistantLocale } from "@/lib/assistant/context";

// ---------------------------------------------------------------------------
// Solenne admin assistant — POST /api/admin-assistant
//
// Deliberately separate from the public storefront route (/api/chat): this one
// requires a verified Supabase session, an active account and at least one
// management permission before a single token is generated.
//
// Layers, in order:
//   1. same-origin check (Origin / Sec-Fetch-Site)
//   2. session + management gate (lib/authz.ts -> database RBAC)
//   3. zod body validation (bounded history, hint-only context)
//   4. per-USER rate limit (Workers binding, not per IP)
//   5. per-role tool set (lib/admin-assistant/tools.ts) + per-tool re-check
//   6. audit row per tool execution (lib/admin-assistant/audit.ts)
//
// The body's `context` is a HINT for the prompt only. Authorization never reads
// it; tools derive everything from the verified session and the database.
// ---------------------------------------------------------------------------

const messagePartSchema = z
  .object({
    type: z.string().max(40),
    text: z.string().max(4000).optional(),
  })
  .passthrough();

const uiMessageSchema = z
  .object({
    id: z.string().max(120).optional(),
    role: z.enum(["system", "user", "assistant"]),
    parts: z.array(messagePartSchema).max(80),
  })
  .passthrough();

const contextSchema = z
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

const requestSchema = z
  .object({
    // Up to 50 are accepted so an older browser tab is not rejected outright;
    // only the last 12 are ever sent upstream.
    messages: z.array(uiMessageSchema).min(1).max(50),
    context: contextSchema.optional(),
    locale: z.enum(["en", "vi"]).optional(),
  })
  .strict();

function jsonError(
  code: string,
  status: number,
  headers?: Record<string, string>
): Response {
  return Response.json({ error: code }, { status, headers });
}

/**
 * Blocks cross-site POSTs. Browsers send `Sec-Fetch-Site` on every fetch;
 * `Origin` is checked as well. A missing Origin (non-browser client, curl) is
 * allowed through this layer because the session gate still applies — the
 * request cannot do anything without a real Supabase cookie.
 */
function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  const expectedHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;

  try {
    return new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

function textLengthOf(message: z.infer<typeof uiMessageSchema>): number {
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
 */
function toSafeHistory(
  messages: z.infer<typeof uiMessageSchema>[]
): UIMessage[] {
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

async function resolveLocale(requested: unknown): Promise<AssistantLocale> {
  if (requested === "vi" || requested === "en") return requested;

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  if (cookieLocale === "vi" || cookieLocale === "en") return cookieLocale;

  return "en";
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError("cross_origin", 403);
  }

  // 1. Session + management gate. AuthError carries the correct status.
  let actor;
  try {
    actor = await requireAnyPermission(MANAGEMENT_PERMISSIONS);
  } catch (error) {
    if (error instanceof AuthError) {
      return jsonError(
        error.status === 401 ? "unauthenticated" : "forbidden",
        error.status
      );
    }

    console.error("[admin-assistant] authorization failed", error);
    return jsonError("unavailable", 500);
  }

  // 2. Body validation.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("invalid_request", 400);
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError("invalid_request", 400);
  }

  const history = parsed.data.messages.slice(-ADMIN_ASSISTANT_MAX_HISTORY_MESSAGES);
  const inputCharacters = history.reduce(
    (total, message) => total + textLengthOf(message),
    0
  );

  if (inputCharacters > ADMIN_ASSISTANT_MAX_INPUT_CHARACTERS) {
    return jsonError("conversation_too_long", 413);
  }

  const locale = await resolveLocale(parsed.data.locale);

  try {
    const { env } = await getCloudflareContext({ async: true });

    // 3. Per-USER throttle. Unlike the storefront's per-IP valve this keys on
    //    the verified user id, so one operator cannot exhaust a shared office
    //    IP and a throttled user cannot rotate IPs to bypass it.
    const limiter = env.ADMIN_ASSISTANT_LIMITER;
    if (limiter) {
      const { success } = await limiter.limit({
        key: `admin-assistant:${actor.userId}`,
      });
      if (!success) {
        return jsonError("rate_limited", 429, { "Retry-After": "60" });
      }
    }

    // 4. Tools for THIS actor, plus a prompt that only advertises them.
    const tools = createAdminAssistantTools(actor);
    const system = buildAdminAssistantSystemPrompt({
      locale,
      role: actor.role,
      permissions: actor.permissions,
      tools: promptToolSummaries(tools),
      context: parsed.data.context,
    });

    const workersai = createWorkersAI({ binding: env.AI });
    const modelMessages = await convertToModelMessages(toSafeHistory(history));

    const result = streamText({
      model: workersai(ADMIN_ASSISTANT_MODEL_ID),
      system,
      messages: modelMessages,
      tools,
      toolChoice: "auto",
      stopWhen: stepCountIs(ADMIN_ASSISTANT_MAX_STEPS),
      maxOutputTokens: ADMIN_ASSISTANT_MAX_OUTPUT_TOKENS,
      // Text-delta duplication only: tool-call, tool-result and step chunks are
      // forwarded untouched by this transform.
      experimental_transform:
        collapseDuplicateTextDeltas() as unknown as StreamTextTransform<ToolSet>,
      onError: ({ error }) => {
        console.error("[admin-assistant] stream error", error);
      },
    });

    return result.toUIMessageStreamResponse({
      onError: () => "The assistant is unavailable right now.",
    });
  } catch (error) {
    console.error("[admin-assistant] request failed", error);
    return jsonError("unavailable", 500);
  }
}
