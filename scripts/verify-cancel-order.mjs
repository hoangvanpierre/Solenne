#!/usr/bin/env node
// ===========================================================================
// Solenne — Static Verification Harness for Atomic Order Cancellation
// ===========================================================================
// Statically verifies that 0006_cancel_order_atomic.sql and
// app/actions/orders.ts satisfy all atomic cancellation invariants:
//   - SECURITY DEFINER + search_path hardening
//   - in-function permission verification (order.cancel)
//   - auth.uid() identity derivation (no client-supplied actor_id)
//   - row-level locking (FOR UPDATE)
//   - status-machine validation & idempotency
//   - atomic relative inventory increments (no absolute replacement)
//   - transactional all-or-nothing missing variant aborts
//   - in-transaction audit logging (order.cancelled)
//   - execution privilege hardening (no anon grant)
//   - server action wiring and error code mapping
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

console.log("== Migration checks (supabase/migrations/0006_cancel_order_atomic.sql) ==");
const migrationPath = new URL("../supabase/migrations/0006_cancel_order_atomic.sql", import.meta.url);
assert("migration 0006 file exists", fs.existsSync(migrationPath));

const sql = fs.readFileSync(migrationPath, "utf8");

assert("defines function public.cancel_order", sql.includes("create or replace function public.cancel_order("));
assert("accepts order UUID and optional reason only", sql.includes("p_order_id uuid") && sql.includes("p_reason text default null"));
assert("never accepts actor_id argument from caller", !sql.includes("p_actor_id"));
assert("is SECURITY DEFINER", sql.includes("security definer"));
assert("sets hardened search_path", /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i.test(sql));
assert("derives actor identity from auth.uid()", sql.includes("v_actor_id := auth.uid();"));
assert("rejects unauthenticated callers", sql.includes("UNAUTHENTICATED"));
assert("verifies order.cancel permission in-function", sql.includes("public.has_permission('order.cancel')"));
assert("locks order row FOR UPDATE", /from\s+public\.orders[\s\S]*?for\s+update/i.test(sql));
assert("checks for existing order existence", sql.includes("ORDER_NOT_FOUND"));
assert("enforces idempotency on already cancelled orders", sql.includes("ORDER_ALREADY_CANCELLED"));
assert("restricts cancellation to pending, paid, processing", sql.includes("'pending', 'paid', 'processing'"));
assert("rejects non-cancellable statuses", sql.includes("ORDER_STATUS_NOT_CANCELLABLE"));
assert("checks variant existence and aborts on missing variant", sql.includes("VARIANT_NOT_FOUND"));
assert("performs relative atomic stock increment", /stock_quantity\s*=\s*stock_quantity\s*\+\s*v_item\.quantity/i.test(sql));
assert("transitions status to cancelled with updated_at", /update\s+public\.orders\s+set\s+status\s*=\s*'cancelled',\s*updated_at\s*=\s*now\(\)/i.test(sql));
assert("writes audit log with order.cancelled inside transaction", sql.includes("'order.cancelled'"));
assert("revokes execute from public and anon", sql.includes("revoke all on function public.cancel_order(uuid, text) from public;") && sql.includes("revoke all on function public.cancel_order(uuid, text) from anon;"));
assert("grants execute to authenticated and service_role", sql.includes("grant execute on function public.cancel_order(uuid, text) to authenticated;") && sql.includes("grant execute on function public.cancel_order(uuid, text) to service_role;"));
assert("includes self-verification block", sql.includes("Migration 0006 failed"));

console.log("\n== Server action wiring (app/actions/orders.ts) ==");
const actionPath = new URL("../app/actions/orders.ts", import.meta.url);
assert("app/actions/orders.ts exists", fs.existsSync(actionPath));

const actionCode = fs.readFileSync(actionPath, "utf8");

assert("exports cancelOrderAction", actionCode.includes("export async function cancelOrderAction("));
assert("enforces requirePermission('order.cancel')", actionCode.includes('requirePermission("order.cancel")'));
assert("validates order UUID format", actionCode.includes("UUID_REGEX.test(orderId)"));
assert("invokes cancel_order RPC on user-scoped client", actionCode.includes('.rpc("cancel_order"'));
assert("passes only p_order_id and p_reason to RPC", actionCode.includes("p_order_id: orderId") && actionCode.includes("p_reason:"));
assert("maps ORDER_ALREADY_CANCELLED error", actionCode.includes("ORDER_ALREADY_CANCELLED"));
assert("maps ORDER_NOT_FOUND error", actionCode.includes("ORDER_NOT_FOUND"));
assert("maps ORDER_STATUS_NOT_CANCELLABLE error", actionCode.includes("ORDER_STATUS_NOT_CANCELLABLE"));
assert("maps VARIANT_NOT_FOUND error", actionCode.includes("VARIANT_NOT_FOUND"));
assert("maps FORBIDDEN error", actionCode.includes("FORBIDDEN"));
assert("revalidates admin and account order paths", actionCode.includes('revalidatePath("/admin/orders")') && actionCode.includes('revalidatePath("/account/orders")'));

console.log("\n== Summary ==");
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
