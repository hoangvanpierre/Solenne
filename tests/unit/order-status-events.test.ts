import test from "node:test";
import assert from "node:assert/strict";
import {
  isBackfillEvent,
  isMissingOrderStatusEventsSchema,
  isOrderStatusTimelineUnavailableError,
  mapOrderStatusEventRow,
  OrderStatusTimelineUnavailableError,
  sortOrderStatusEvents,
} from "../../lib/order-status-events-core.ts";
import type { OrderStatusEvent } from "../../types/order.ts";

const BASE_ROW = {
  id: "e1111111-1111-4111-8111-111111111111",
  order_id: "o1111111-1111-4111-8111-111111111111",
  from_status: "pending",
  to_status: "processing",
  actor_user_id: "a1111111-1111-4111-8111-111111111111",
  reason: "Packed",
  tracking_code: null,
  source: "transition",
  created_at: "2026-11-08T10:00:00.000Z",
};

test("maps a database row onto the public event model", () => {
  assert.deepEqual(mapOrderStatusEventRow(BASE_ROW), {
    id: BASE_ROW.id,
    orderId: BASE_ROW.order_id,
    fromStatus: "pending",
    toStatus: "processing",
    actorUserId: BASE_ROW.actor_user_id,
    reason: "Packed",
    trackingCode: undefined,
    source: "transition",
    createdAt: BASE_ROW.created_at,
  });
});

test("keeps a null creation/backfill origin as null", () => {
  const mapped = mapOrderStatusEventRow({
    ...BASE_ROW,
    from_status: null,
    actor_user_id: null,
    reason: null,
    source: "backfill",
  });

  assert.equal(mapped.fromStatus, null);
  assert.equal(mapped.actorUserId, undefined);
  assert.equal(mapped.reason, undefined);
});

test("sorts oldest first and tie-breaks by id without mutating input", () => {
  const events: OrderStatusEvent[] = [
    {
      id: "b-event",
      orderId: "order",
      fromStatus: "processing",
      toStatus: "shipped",
      source: "transition",
      createdAt: "2026-11-08T12:00:00.000Z",
    },
    {
      id: "a-event",
      orderId: "order",
      fromStatus: null,
      toStatus: "pending",
      source: "creation",
      createdAt: "2026-11-08T10:00:00.000Z",
    },
    {
      id: "c-event",
      orderId: "order",
      fromStatus: "shipped",
      toStatus: "delivered",
      source: "transition",
      createdAt: "2026-11-08T12:00:00.000Z",
    },
  ];

  const sorted = sortOrderStatusEvents(events);

  assert.deepEqual(
    sorted.map((event) => event.id),
    ["a-event", "b-event", "c-event"]
  );
  assert.deepEqual(
    events.map((event) => event.id),
    ["b-event", "a-event", "c-event"]
  );
});

test("recognizes only backfilled rows", () => {
  assert.equal(
    isBackfillEvent({
      id: "x",
      orderId: "order",
      fromStatus: null,
      toStatus: "processing",
      source: "backfill",
      createdAt: "2026-11-08T10:00:00.000Z",
    }),
    true
  );
  assert.equal(
    isBackfillEvent({
      id: "y",
      orderId: "order",
      fromStatus: null,
      toStatus: "pending",
      source: "creation",
      createdAt: "2026-11-08T10:00:00.000Z",
    }),
    false
  );
});

test("detects the missing 0017 table from the PostgREST schema cache", () => {
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST205",
      message:
        "Could not find the table 'public.order_status_events' in the schema cache",
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "42P01",
      message: 'relation "public.order_status_events" does not exist',
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      message:
        "Could not find the table 'public.order_status_events' in the schema cache",
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST205",
      message: "Could not find the requested relation in the schema cache",
      details: "table 'public.order_status_events'",
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "42P01",
      message: "relation does not exist",
      hint: 'relation "public.order_status_events" does not exist',
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message:
        "Could not find the function public.get_order_status_events_admin(p_order_id) in the schema cache",
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message:
        "Could not find the function public.get_order_status_events_admin(p_order_id uuid) in the schema cache",
    }),
    true
  );
});

test("recognizes PGRST202 only for the exact admin RPC invocation", () => {
  const exactMessage =
    "Could not find the function public.get_order_status_events_admin(p_order_id) in the schema cache";

  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message: exactMessage,
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message: "Could not find the function in the schema cache",
      details: exactMessage,
    }),
    true
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message: "Could not find the function in the schema cache",
      hint: "function public.get_order_status_events_admin(p_order_id)",
    }),
    true
  );

  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message:
        "Could not find the function public.get_other_order_status(p_order_id) in the schema cache",
    }),
    false
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message:
        "Could not find the function public.get_order_status_events_admin(integer) in the schema cache",
    }),
    false
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message:
        "Could not find the function public.get_order_status_events_admin(p_order_id => text) in the schema cache",
    }),
    false
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST202",
      message:
        "Could not find the function public.get_order_status_events_admin(p_order_id) in the schema cache",
      hint: "Perhaps you meant to call the function public.get_order_status_events_admin(p_order_id => uuid)",
    }),
    false
  );
});

test("does not hide unrelated database failures as unavailable", () => {
  assert.equal(isMissingOrderStatusEventsSchema(null), false);
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "PGRST205",
      message: "Could not find the table 'public.other_table' in the schema cache",
    }),
    false
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "42703",
      message: 'column order_status_events.reason does not exist',
    }),
    false
  );
  assert.equal(
    isMissingOrderStatusEventsSchema({
      code: "08006",
      message: "connection failure",
    }),
    false
  );
});

test("recognizes the typed unavailable error across module identities", () => {
  assert.equal(
    isOrderStatusTimelineUnavailableError(
      new OrderStatusTimelineUnavailableError()
    ),
    true
  );

  const duplicateClassInstance = new Error("duplicated module class");
  duplicateClassInstance.name = "OrderStatusTimelineUnavailableError";
  assert.equal(
    isOrderStatusTimelineUnavailableError(duplicateClassInstance),
    true
  );

  assert.equal(
    isOrderStatusTimelineUnavailableError(new Error("genuine failure")),
    false
  );
  assert.equal(isOrderStatusTimelineUnavailableError(null), false);
});
