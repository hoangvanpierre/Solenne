#!/usr/bin/env node
// ===========================================================================
// Solenne — Static Verification Harness for Order Status History (0017)
// ===========================================================================
// Verifies:
//   - append-only order_status_events schema, FKs, checks and indexes
//   - RLS: own-order reads + order.read reads; no client write path
//   - least-privilege grants (authenticated SELECT only, anon nothing)
//   - backfill records only the status known at migration time
//   - create_order / update_order_status / cancel_order record events in the
//     same transaction and preserve their SECURITY DEFINER hardening
//   - customer/admin timeline data access and UI wiring
// ===========================================================================
import fs from "node:fs";

let passed = 0;
let failed = 0;

function assert(description, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${description}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${description} ${detail ? `-> ${detail}` : ""}`);
  }
}

const read = (relativePath) =>
  fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");

console.log("== Migration 0017: table, keys and checks ==");
const migrationPath = new URL(
  "../supabase/migrations/0017_order_status_events.sql",
  import.meta.url
);
assert("migration 0017 file exists", fs.existsSync(migrationPath));
const sql = fs.readFileSync(migrationPath, "utf8");

assert(
  "creates public.order_status_events",
  sql.includes("create table if not exists public.order_status_events")
);
assert(
  "captures the documented columns",
  ["id", "order_id", "from_status", "to_status", "actor_user_id", "reason", "tracking_code", "source", "created_at"].every(
    (column) =>
      new RegExp(`^\\s*${column}\\s`, "m").test(sql) ||
      sql.includes(`${column} uuid`) ||
      sql.includes(`${column} text`)
  )
);
assert(
  "order_id references orders with cascade",
  /order_id uuid not null references public\.orders\(id\) on delete cascade/i.test(
    sql
  )
);
assert(
  "actor_user_id references profiles and survives actor deletion",
  /actor_user_id uuid references public\.profiles\(id\) on delete set null/i.test(
    sql
  )
);
assert(
  "status checks cover the six real statuses",
  sql.includes(
    "from_status in ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')"
  ) &&
    sql.includes(
      "to_status in ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')"
    )
);
assert(
  "source check distinguishes creation/transition/cancellation/backfill",
  sql.includes(
    "source in ('creation', 'transition', 'cancellation', 'backfill')"
  )
);
assert(
  "self-transitions are rejected",
  sql.includes("from_status is null or from_status <> to_status")
);
assert(
  "timeline index is (order_id, created_at, id)",
  /order_status_events_order_timeline_idx[\s\S]*?\(order_id, created_at asc, id asc\)/i.test(
    sql
  )
);
assert(
  "actor lookup index exists",
  sql.includes("order_status_events_actor_idx")
);
assert(
  "one creation event per order is enforced",
  sql.includes("order_status_events_one_creation_uidx") &&
    /where source = 'creation'/.test(sql)
);
assert(
  "one backfill event per order is enforced",
  sql.includes("order_status_events_one_backfill_uidx") &&
    /where source = 'backfill'/.test(sql)
);

console.log("\n== RLS and least privilege ==");
assert("RLS is enabled", sql.includes("alter table public.order_status_events enable row level security"));
assert(
  "customers read only events for their own orders",
  sql.includes("create policy order_status_events_select_own") &&
    /o\.id = order_status_events\.order_id[\s\S]*?o\.user_id = auth\.uid\(\)/.test(
      sql
    )
);
assert(
  "staff/manager/admin access follows order.read",
  sql.includes("create policy order_status_events_select_with_order_read") &&
    sql.includes("public.has_permission('order.read')")
);
assert(
  "no INSERT/UPDATE/DELETE policy is defined",
  !/create policy[^;]+for (insert|update|delete)/i.test(sql)
);
assert(
  "all API write privileges are revoked",
  sql.includes(
    "revoke all on public.order_status_events from public, anon, authenticated, service_role;"
  )
);
assert(
  "table-level SELECT is revoked from authenticated",
  sql.includes(
    "revoke select on table public.order_status_events from authenticated;"
  )
);
assert(
  "authenticated gets column-level SELECT on the timeline fields",
  /grant select \(\s*id,\s*order_id,\s*from_status,\s*to_status,\s*tracking_code,\s*source,\s*created_at\s*\)\s*on public\.order_status_events\s*to authenticated;/s.test(
    sql
  )
);
assert(
  "authenticated is not granted actor_user_id or reason",
  !/grant select \([^)]*actor_user_id[^)]*\)\s*on public\.order_status_events\s*to authenticated;/is.test(
    sql
  ) &&
    !/grant select \([^)]*reason[^)]*\)\s*on public\.order_status_events\s*to authenticated;/is.test(
      sql
    )
);
assert(
  "authenticated has no write grant",
  !/grant[^;]*(insert|update|delete)[^;]*on public\.order_status_events to authenticated/i.test(
    sql
  )
);
assert(
  "service_role gets read-only history access",
  sql.includes("grant select on public.order_status_events to service_role;") &&
    !/grant[^;]*(insert|update|delete)[^;]*on public\.order_status_events to service_role/i.test(
      sql
    )
);
assert(
  "defines an order.read-gated admin history RPC",
  sql.includes(
    "create or replace function public.get_order_status_events_admin("
  ) &&
    /get_order_status_events_admin[\s\S]*?security definer[\s\S]*?public\.has_permission\('order\.read'\)/.test(
      sql
    )
);
assert(
  "the admin RPC is executable only by authenticated/service_role",
  sql.includes(
    "grant execute on function public.get_order_status_events_admin(uuid) to authenticated;"
  ) &&
    sql.includes(
      "revoke all on function public.get_order_status_events_admin(uuid) from anon;"
    )
);

console.log("\n== Backfill ==");
assert(
  "backfill is explicitly marked as source backfill",
  /select[\s\S]*?'backfill'[\s\S]*?from public\.orders o/i.test(sql)
);
assert(
  "backfill uses only the current order status",
  /o\.status,[\s\S]*?'backfill'/i.test(sql)
);
assert(
  "backfill leaves from_status and actor NULL",
  /select\s+o\.id,\s+null,\s+o\.status,\s+null,/i.test(sql)
);
assert(
  "backfill never duplicates an existing history",
  /where not exists \(\s*select 1\s+from public\.order_status_events e/i.test(sql)
);

console.log("\n== Transactional event recording ==");
const createFn = sql.slice(
  sql.indexOf("create or replace function public.create_order("),
  sql.indexOf("create or replace function public.update_order_status(")
);
assert(
  "create_order is SECURITY DEFINER with an empty search_path",
  /security definer/i.test(createFn) && /set search_path = ''/i.test(createFn)
);
assert(
  "create_order records exactly one initial pending event",
  createFn.includes("insert into public.order_status_events") &&
    createFn.includes("'creation'") &&
    createFn.includes("'pending'") &&
    createFn.indexOf("order_status_events") < createFn.lastIndexOf("insert into public.audit_logs")
);

const updateFn = sql.slice(
  sql.indexOf("create or replace function public.update_order_status("),
  sql.indexOf("create or replace function public.cancel_order(")
);
assert(
  "update_order_status is SECURITY DEFINER",
  /security definer/i.test(updateFn)
);
assert(
  "update_order_status records transition events",
  updateFn.includes("insert into public.order_status_events") &&
    updateFn.includes("'transition'")
);
assert(
  "both fulfillment branches record an event",
  (updateFn.match(/insert into public\.order_status_events/g) ?? []).length === 2
);
assert(
  "transition event carries from/to/actor/reason/tracking",
  updateFn.includes("v_order.status") &&
    updateFn.includes("p_target_status") &&
    updateFn.includes("v_actor_id") &&
    updateFn.includes("v_trimmed_reason") &&
    updateFn.includes("v_tracking_after")
);

const cancelFn = sql.slice(
  sql.indexOf("create or replace function public.cancel_order("),
  sql.indexOf("-- Re-assert the execution boundary")
);
assert(
  "cancel_order is SECURITY DEFINER",
  /security definer/i.test(cancelFn)
);
assert(
  "cancel_order records a cancellation event",
  cancelFn.includes("insert into public.order_status_events") &&
    cancelFn.includes("'cancellation'") &&
    cancelFn.includes("'cancelled'")
);
assert(
  "cancel_order reads tracking_code for the event",
  /select id, order_number, status, tracking_code/i.test(cancelFn)
);
assert(
  "preserves stock restoration and outbox",
  /stock_quantity = stock_quantity \+ v_item\.quantity/i.test(cancelFn) &&
    cancelFn.includes("order_outbox_events") &&
    cancelFn.includes("'order.cancelled'")
);
assert(
  "keeps execute grants on all three RPCs",
  ["create_order", "update_order_status", "cancel_order"].every((name) =>
    sql.includes(`grant execute on function public.${name}(`)
  )
);
assert(
  "self-verification fails loudly",
  sql.includes("Migration 0017 failed") &&
    sql.includes("order(s) have no status event")
);

console.log("\n== Type and data-layer wiring ==");
const types = read("../types/order.ts");
assert(
  "exports OrderStatusEvent",
  types.includes("export interface OrderStatusEvent")
);
assert(
  "exports the four history sources",
  types.includes("export type OrderStatusEventSource") &&
    ["creation", "transition", "cancellation", "backfill"].every((source) =>
      types.includes(`'${source}'`)
    )
);
assert(
  "event model carries actor, reason and tracking",
  ["actorUserId", "actorName", "reason", "trackingCode", "source", "createdAt"].every(
    (field) => types.includes(`${field}`)
  )
);

const orders = read("../lib/orders.ts");
assert(
  "exports customer timeline reader",
  orders.includes("export async function getOrderStatusEvents(")
);
assert(
  "exports admin timeline reader",
  orders.includes("export async function getAdminOrderStatusEvents(")
);
assert(
  "customer reader enforces ownership or order.read",
  /getOrderStatusEvents[\s\S]*?requireOwnershipOrPermission\(userId, "order\.read"\)/.test(
    orders
  )
);
assert(
  "admin reader re-checks order.read",
  /getAdminOrderStatusEvents[\s\S]*?requirePermission\("order\.read"\)/.test(
    orders
  )
);
assert(
  "timeline reads are oldest-first with a deterministic tie-break",
  orders.includes('.order("created_at", { ascending: true })') &&
    orders.includes('.order("id", { ascending: true })')
);
assert(
  "actor names are resolved in one batched profile read",
  orders.includes('.from("profiles")') &&
    orders.includes('.select("id, full_name")') &&
    orders.includes('.in("id", actorIds)')
);
assert(
  "the app never writes order_status_events directly",
  !/\.from\("order_status_events"\)\s*\.(insert|update|delete)/.test(orders)
);
assert(
  "customer timeline reads only the granted columns",
  orders.includes(
    "id, order_id, from_status, to_status, tracking_code, source, created_at"
  ) && !/\.from\("order_status_events"\)\s*\.select\("\*"\)/.test(orders)
);
assert(
  "admin timeline uses the order.read-gated RPC",
  orders.includes('.rpc(\n    "get_order_status_events_admin"') ||
    orders.includes('"get_order_status_events_admin"')
);

const core = read("../lib/order-status-events-core.ts");
assert(
  "pure row/timeline helpers are shared with the UI",
  core.includes("mapOrderStatusEventRow") &&
    core.includes("sortOrderStatusEvents") &&
    core.includes("isBackfillEvent")
);
assert(
  "timeline ordering is oldest-first with an id tie-break",
  /a\.createdAt\)[\s\S]*?b\.createdAt\)/.test(core) &&
    core.includes("a.id.localeCompare(b.id)")
);
assert(
  "detects a pending 0017 migration as a known schema state",
  core.includes("isMissingOrderStatusEventsSchema") &&
    core.includes("PGRST205") &&
    core.includes("42P01") &&
    core.includes("OrderStatusTimelineUnavailableError")
);
assert(
  "schema detection reads message, details and hint",
  core.includes("details") && core.includes("hint")
);
assert(
  "PGRST202 is narrowed to the exact admin RPC invocation",
  core.includes("get_order_status_events_admin") &&
    core.includes("p_order_id") &&
    core.includes("signatureMismatch")
);
assert(
  "both timeline readers convert the expected schema state to the typed error",
  (orders.match(/isMissingOrderStatusEventsSchema\(error\)/g) ?? []).length >= 2 &&
    (
      orders.match(/throw new OrderStatusTimelineUnavailableError\(\)/g) ?? []
    ).length >= 2
);

console.log("\n== Customer and admin UI ==");
const timeline = read("../components/account/order-timeline.tsx");
assert(
  "timeline component exists",
  fs.existsSync(
    new URL("../components/account/order-timeline.tsx", import.meta.url)
  )
);
assert(
  "exports OrderTimeline",
  timeline.includes("export function OrderTimeline(")
);
assert(
  "renders the current status",
  timeline.includes("currentStatus") && timeline.includes("OrderStatusBadge")
);
assert(
  "renders previous status for the admin variant",
  timeline.includes('variant === "admin"') ||
    (timeline.includes("isAdmin") && timeline.includes("event.fromStatus"))
);
assert(
  "renders timestamps",
  timeline.includes("formatTimestamp(") && timeline.includes("<time")
);
assert(
  "renders tracking codes",
  timeline.includes("trackingCode") && timeline.includes("Tracking:")
);
assert(
  "renders admin reason and actor",
  timeline.includes("event.reason") && timeline.includes("actorLabel(")
);
assert(
  "has empty and error states",
  timeline.includes("No status events have been recorded") &&
    timeline.includes("couldn't load the status history")
);
assert(
  "has a neutral unavailable state for a pending 0017 migration",
  timeline.includes("unavailable") &&
    timeline.includes("Order history isn't available yet")
);
assert(
  "distinguishes backfill from observed transitions",
  timeline.includes("backfill") &&
    timeline.includes("Status recorded when order history was enabled")
);
assert(
  "is bilingual",
  timeline.includes("Dòng thời gian đơn hàng") &&
    timeline.includes("Order timeline")
);
assert(
  "barrel exports the timeline",
  read("../components/account/index.ts").includes("OrderTimeline")
);

const customerPage = read("../app/(marketing)/checkout/success/page.tsx");
assert(
  "customer receipt loads own status events",
  customerPage.includes("getOrderStatusEvents") &&
    customerPage.includes("user.id")
);
assert(
  "customer receipt renders the timeline",
  customerPage.includes("<OrderTimeline")
);
assert(
  "customer timeline errors do not take down the receipt",
  customerPage.includes("timelineFailed") &&
    customerPage.includes("error={timelineFailed}")
);
assert(
  "customer receipt treats a pending 0017 migration as unavailable, not an error",
  customerPage.includes("OrderStatusTimelineUnavailableError") &&
    customerPage.includes("timelineUnavailable") &&
    customerPage.includes("unavailable={timelineUnavailable}")
);

const adminPage = read("../app/admin/orders/[id]/page.tsx");
assert(
  "admin detail loads management status events",
  adminPage.includes("getAdminOrderStatusEvents")
);
assert(
  "admin detail renders the admin timeline",
  adminPage.includes("<OrderTimeline") &&
    adminPage.includes('variant="admin"')
);
assert(
  "admin timeline errors do not take down the order",
  adminPage.includes("timelineFailed") &&
    adminPage.includes("error={timelineFailed}")
);
assert(
  "admin detail treats a pending 0017 migration as unavailable, not an error",
  adminPage.includes("OrderStatusTimelineUnavailableError") &&
    adminPage.includes("timelineUnavailable") &&
    adminPage.includes("unavailable={timelineUnavailable}")
);

console.log("\n== Summary ==");
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
