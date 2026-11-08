import type {
  OrderStatus,
  OrderStatusEvent,
  OrderStatusEventSource,
} from "@/types";

/**
 * Pure row/timeline helpers shared by the server data layer and the timeline
 * component. Keeping them free of Supabase/Next imports makes the ordering and
 * normalization rules unit-testable without a database or a React renderer.
 */
export interface OrderStatusEventRow {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  actor_user_id?: string | null;
  reason?: string | null;
  tracking_code: string | null;
  source: string;
  created_at: string;
}

export function mapOrderStatusEventRow(
  row: OrderStatusEventRow
): OrderStatusEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    fromStatus: (row.from_status as OrderStatus | null) ?? null,
    toStatus: row.to_status as OrderStatus,
    actorUserId: row.actor_user_id ?? undefined,
    reason: row.reason ?? undefined,
    trackingCode: row.tracking_code ?? undefined,
    source: row.source as OrderStatusEventSource,
    createdAt: row.created_at,
  };
}

/** Oldest first, with the event id as a deterministic same-timestamp tie-break. */
export function sortOrderStatusEvents(
  events: readonly OrderStatusEvent[]
): OrderStatusEvent[] {
  return [...events].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id.localeCompare(b.id)
  );
}

export function isBackfillEvent(event: OrderStatusEvent): boolean {
  return event.source === "backfill";
}

/**
 * True when migration 0017 has not been applied (or PostgREST has not reloaded
 * it yet). This is an expected deployment state, not a broken timeline: the UI
 * shows a neutral "not available yet" message and does not log a console error.
 *
 * Table errors: PGRST205 / 42P01, with details and hints included in the match.
 * RPC errors: PGRST202 / 42883 only when the exact admin RPC is named with the
 * expected `p_order_id` invocation. Unrelated missing functions and signature
 * mismatches stay real errors.
 */
export function isMissingOrderStatusEventsSchema(
  error: {
    code?: string | null;
    message?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null | undefined
): boolean {
  if (!error) return false;

  const text = [error.message, error.details, error.hint]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLowerCase();

  if (error.code === "PGRST202" || error.code === "42883") {
    if (!text.includes("order_status_events")) return false;

    // The missing-function message must identify the exact admin RPC and the
    // argument the application sends. `integer`, `p_order_id => text`, etc.
    // are signature mismatches, not the pre-migration state.
    const expectedCall =
      /get_order_status_events_admin\s*\(\s*p_order_id\s*(?:(?:=>|\s)\s*uuid)?\s*\)/i;
    if (!expectedCall.test(text)) return false;

    // PostgREST uses these hints when a same-named function exists but its
    // signature does not match. That is a real deployment/API error.
    const signatureMismatch =
      /(perhaps you meant|did you mean|no function matches|could not choose a best candidate|ambiguous)/i;
    return !signatureMismatch.test(text);
  }

  if (!text.includes("order_status_events")) return false;

  if (error.code === "42P01" || error.code === "PGRST205") return true;

  return (
    text.includes("could not find the table") ||
    (text.includes("relation") && text.includes("does not exist")) ||
    (text.includes("table") && text.includes("does not exist"))
  );
}

/** Thrown when the history table is not present yet (migration 0017 pending). */
export class OrderStatusTimelineUnavailableError extends Error {
  constructor() {
    super("Order status history is not available yet.");
    this.name = "OrderStatusTimelineUnavailableError";
  }
}

/**
 * `instanceof` plus a name check: the server graph can load this module through
 * more than one entry point, and a duplicated class identity must not turn the
 * expected 0017-pending state into a logged error.
 */
export function isOrderStatusTimelineUnavailableError(
  error: unknown
): boolean {
  return (
    error instanceof OrderStatusTimelineUnavailableError ||
    (error instanceof Error &&
      error.name === "OrderStatusTimelineUnavailableError")
  );
}
