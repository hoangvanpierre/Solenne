/**
 * Minimal structured logging for server-side request paths.
 *
 * Emits one JSON object per line to stdout/stderr, which is what Cloudflare
 * Workers Logs ingests (see the `observability` block in `wrangler.jsonc`) and
 * what `next dev` prints in the terminal. No dependency, no transport, no
 * buffering: the platform is the sink.
 *
 * Deliberate constraints:
 *   * Only allow-listed keys are serialised, so a caller cannot accidentally
 *     ship a customer email, an address, a token or a conversation body.
 *   * Messages from `Error` objects are never emitted - only the constructor
 *     name and a coarse classification, which is enough to group failures
 *     without leaking query text or SQL fragments.
 *   * Values are truncated and control characters are stripped so a single
 *     log line can never be forged or split.
 *
 * This is a baseline, not an APM integration. See
 * docs/quality/production-readiness.md for the metrics that are still gaps.
 */

export type LogLevel = "info" | "warn" | "error";

export type ErrorClass =
  | "auth"
  | "validation"
  | "rate_limited"
  | "timeout"
  | "upstream"
  | "unclassified";

export type LogOutcome = "ok" | "blocked" | "failed";

/**
 * The complete set of fields a log line may carry. Anything not listed here is
 * dropped by `sanitize`, including extra properties passed by mistake.
 */
export interface LogFields {
  /** Stable, low-cardinality event name, e.g. "chat.rate_limited". */
  event: string;
  /** Route or surface, e.g. "/api/chat". */
  route?: string;
  /** Named operation inside the route, e.g. "authorize". */
  operation?: string;
  /** HTTP status of the response that was produced. */
  status?: number;
  /** Wall-clock duration of the handled work. */
  durationMs?: number;
  /** Correlation id: Cloudflare `cf-ray` when present, else a random UUID. */
  requestId?: string;
  /** Opaque Supabase user id. Never an email, name or phone number. */
  actorId?: string;
  /** Role name from the verified actor context (customer, staff, ...). */
  actorRole?: string | null;
  outcome?: LogOutcome;
  errorClass?: ErrorClass;
  errorName?: string;
}

const TEXT_LIMITS: Partial<Record<keyof LogFields, number>> = {
  event: 80,
  route: 120,
  operation: 60,
  requestId: 80,
  actorId: 64,
  actorRole: 32,
  errorName: 60,
};

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function sanitizeText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;

  const cleaned = value.replace(CONTROL_CHARACTERS, " ").trim();
  if (cleaned.length === 0) return undefined;

  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}

function sanitizeNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.round(value));
}

function sanitize(fields: LogFields): Record<string, string | number> {
  const record: Record<string, string | number> = {};

  for (const [key, limit] of Object.entries(TEXT_LIMITS)) {
    if (typeof limit !== "number") continue;

    const value = sanitizeText(fields[key as keyof LogFields], limit);
    if (value !== undefined) record[key] = value;
  }

  for (const key of ["status", "durationMs"] as const) {
    const value = sanitizeNumber(fields[key]);
    if (value !== undefined) record[key] = value;
  }

  if (fields.outcome) record.outcome = fields.outcome;
  if (fields.errorClass) record.errorClass = fields.errorClass;

  return record;
}

function emit(level: LogLevel, fields: LogFields): void {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    ...sanitize(fields),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Identifies one handled request. `cf-ray` is present on every Cloudflare
 * request and is also searchable in the Workers dashboard, so prefer it for
 * correlation and fall back to a random id for local development.
 */
export interface RequestLogContext {
  requestId: string;
  route: string;
  startedAt: number;
}

export function startRequest(route: string, request?: Request): RequestLogContext {
  const cfRay = request?.headers.get("cf-ray")?.trim();
  let requestId = cfRay && cfRay.length > 0 ? cfRay : "";

  if (!requestId) {
    requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `local-${Date.now().toString(36)}`;
  }

  return { requestId, route, startedAt: Date.now() };
}

/** Milliseconds since `startRequest`. Never negative, never fractional. */
export function elapsedMs(context: RequestLogContext): number {
  return Math.max(0, Date.now() - context.startedAt) | 0;
}

/**
 * Records the terminal outcome of a handled request. Call it once per response
 * path that matters (failures and throttling), not on every successful
 * multi-second stream: Workers Logs already records request duration.
 */
export function logRequest(
  context: RequestLogContext,
  level: LogLevel,
  fields: Omit<LogFields, "requestId" | "route" | "durationMs">
): void {
  emit(level, {
    ...fields,
    requestId: context.requestId,
    route: context.route,
    durationMs: elapsedMs(context),
  });
}

/**
 * Maps an unknown thrown value onto a stable classification. The original
 * message is deliberately discarded: it can contain customer input, SQL, or
 * provider detail, none of which belongs in a shared log stream.
 */
export function classifyError(error: unknown): {
  errorClass: ErrorClass;
  errorName: string;
} {
  if (!(error instanceof Error)) {
    return { errorClass: "unclassified", errorName: typeof error };
  }

  const errorName = error.name || "Error";

  if (errorName === "AbortError" || errorName === "TimeoutError") {
    return { errorClass: "timeout", errorName };
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    if (status === 401 || status === 403) return { errorClass: "auth", errorName };
    if (status === 429) return { errorClass: "rate_limited", errorName };
    if (status >= 500) return { errorClass: "upstream", errorName };
    if (status >= 400) return { errorClass: "validation", errorName };
  }

  return { errorClass: "unclassified", errorName };
}
