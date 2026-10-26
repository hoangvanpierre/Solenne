import { writeAuditLog } from "@/lib/audit";
import type { ActorContext } from "@/types";

// ---------------------------------------------------------------------------
// Solenne admin assistant — audit trail.
//
// Every tool execution leaves one audit_logs row:
//   actor_id      the signed-in operator (from the verified session)
//   action        "assistant.tool_used"  (audit_logs.action is free text, so
//                 no migration is needed; the value is added to AUDIT_ACTIONS
//                 so the audit viewer can filter on it)
//   metadata      source, role, tool, validated arguments, row count, outcome
//
// Arguments are already zod-validated by the tool, but they are bounded again
// here so a future tool cannot smuggle a long string into the audit table.
//
// writeAuditLog() is the existing best-effort helper: it uses the secret-key
// client because audit_logs deliberately grants no INSERT to `authenticated`,
// and it never throws. It is only called AFTER the tool's permission check.
// ---------------------------------------------------------------------------

export const ASSISTANT_AUDIT_ACTION = "assistant.tool_used";

const MAX_ARGUMENT_STRING = 80;
const MAX_ARGUMENT_KEYS = 8;

function sanitizeArgumentValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_ARGUMENT_STRING
      ? `${value.slice(0, MAX_ARGUMENT_STRING)}…`
      : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARGUMENT_KEYS).map(sanitizeArgumentValue);
  }

  if (typeof value === "object") {
    return sanitizeArguments(value as Record<string, unknown>);
  }

  return null;
}

export function sanitizeArguments(
  args: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!args) return {};

  const entries = Object.entries(args).slice(0, MAX_ARGUMENT_KEYS);
  const clean: Record<string, unknown> = {};

  for (const [key, value] of entries) {
    clean[key.slice(0, 40)] = sanitizeArgumentValue(value);
  }

  return clean;
}

export interface AssistantToolAuditInput {
  actor: ActorContext;
  tool: string;
  args: Record<string, unknown> | undefined;
  rowCount: number;
  ok: boolean;
  errorCode?: string;
}

export async function recordAssistantToolUse(
  input: AssistantToolAuditInput
): Promise<void> {
  await writeAuditLog({
    actorId: input.actor.userId,
    action: ASSISTANT_AUDIT_ACTION,
    metadata: {
      source: "assistant",
      role: input.actor.role,
      tool: input.tool,
      args: sanitizeArguments(input.args),
      rowCount: input.rowCount,
      ok: input.ok,
      ...(input.errorCode ? { errorCode: input.errorCode } : {}),
      at: new Date().toISOString(),
    },
  });
}
