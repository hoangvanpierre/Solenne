#!/usr/bin/env node
// ===========================================================================
// Solenne — Static Verification Harness for Atomic, Idempotent Order Creation
// ===========================================================================
// Statically verifies the invariants of migration 0016 and its application
// wiring:
//   - one SECURITY DEFINER RPC with a hardened search_path
//   - identity from auth.uid(), active-account + order.create re-check
//   - input validation for email, address, notes, cart shape and quantities
//   - deterministic FOR UPDATE variant locks, product active check, stock check
//   - database-side pricing + the existing USD shipping/discount rules
//   - order/items/stock/audit writes in the same transaction
//   - order-number uniqueness and idempotency (same key + payload returns the
//     original order; same key + different payload is rejected)
//   - direct INSERT revoked from authenticated, INSERT policies removed
//   - the app calls the RPC on the user-scoped client, not the admin client
//   - the checkout form reuses its key across retries of the same payload
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

console.log(
  "== Migration checks (supabase/migrations/0016_create_order_atomic.sql) =="
);
const migrationPath = new URL(
  "../supabase/migrations/0016_create_order_atomic.sql",
  import.meta.url
);
assert("migration 0016 file exists", fs.existsSync(migrationPath));

const sql = fs.readFileSync(migrationPath, "utf8");

assert(
  "defines public.create_order(...)",
  sql.includes("create or replace function public.create_order(")
);
assert(
  "takes email, address, items, idempotency key and notes only",
  /p_email text/.test(sql) &&
    /p_shipping_address jsonb/.test(sql) &&
    /p_items jsonb/.test(sql) &&
    /p_idempotency_key text/.test(sql) &&
    /p_notes text default null/.test(sql)
);
assert(
  "never accepts a caller-supplied user id",
  !sql.includes("p_user_id") && !sql.includes("p_actor_id")
);
assert("is SECURITY DEFINER", /security\s+definer/i.test(sql));
assert(
  "uses an empty (hardened) search_path",
  /set\s+search_path\s*=\s*''/i.test(sql)
);
assert(
  "derives identity from auth.uid()",
  sql.includes("v_actor_id uuid := auth.uid();")
);
assert(
  "verifies the account is active in-function",
  sql.includes("public.is_active_account()")
);
assert(
  "verifies order.create permission in-function",
  sql.includes("public.has_permission('order.create')")
);
assert("rejects unauthenticated callers", sql.includes("UNAUTHENTICATED||"));
assert("rejects inactive accounts", sql.includes("ACCOUNT_INACTIVE||"));
assert("rejects missing permission", sql.includes("FORBIDDEN||"));

console.log("\n== Input validation ==");
assert("validates email", sql.includes("INVALID_EMAIL||"));
assert("validates the shipping address object", sql.includes("INVALID_ADDRESS||"));
assert(
  "requires the five mandatory address fields",
  ["fullName", "phone", "line1", "postalCode", "country"].every((field) =>
    sql.includes(`jsonb_typeof(p_shipping_address -> '${field}') <> 'string'`)
  )
);
assert("bounds order notes at 500 characters", sql.includes("INVALID_NOTES||") && sql.includes("length(v_notes) > 500"));
assert("rejects non-array/empty carts", sql.includes("INVALID_ITEMS||") && sql.includes("EMPTY_CART||"));
assert("bounds the number of cart lines", sql.includes("TOO_MANY_ITEMS||") && sql.includes("v_item_count > 100"));
assert(
  "rejects quantities outside 1..99 and fractions",
  sql.includes("INVALID_QUANTITY||") &&
    sql.includes("v_quantity_num <> trunc(v_quantity_num)") &&
    sql.includes("v_quantity_num < 1") &&
    sql.includes("v_quantity_num > 99")
);
assert("rejects malformed variant ids", sql.includes("INVALID_VARIANT_ID||"));
assert(
  "rejects duplicate variant ids",
  sql.includes("DUPLICATE_VARIANT||") &&
    /count\(distinct x\)[\s\S]*?<> v_item_count/.test(sql)
);
assert("rejects an unknown/inactive variant", sql.includes("VARIANT_NOT_FOUND||") && sql.includes("PRODUCT_UNAVAILABLE||"));

console.log("\n== Transaction, locking and pricing ==");
assert(
  "locks variants FOR UPDATE",
  /from public\.product_variants pv[\s\S]*?for update of pv/i.test(sql)
);
assert(
  "locks in deterministic variant-id order",
  /order by pairs\.variant_id/i.test(sql)
);
assert("requires the parent product to be active", sql.includes("p.is_active"));
assert("checks stock against the locked row", sql.includes("INSUFFICIENT_STOCK||") && sql.includes("v_line_stocks[v_index] < v_line_quantities[v_index]"));
assert(
  "re-prices from product_variants and rounds money",
  sql.includes("round(v_variant.price") && sql.includes("v_line_unit_prices")
);
assert(
  "preserves free shipping at $50 and $5.99 otherwise",
  /v_subtotal >= 50\.00 then 0\.00 else 5\.99/.test(sql)
);
assert("stores discount = 0", /\n\s+0,\n\s+v_total,/.test(sql));
assert("inserts the order", /insert into public\.orders/i.test(sql));
assert("inserts order_items", /insert into public\.order_items/i.test(sql));
assert(
  "deducts stock relative to the locked value",
  /set stock_quantity = stock_quantity - v_line_quantities\[v_index\]/i.test(sql)
);
assert(
  "writes the order.created audit row in the same function",
  sql.includes("'order.created'") && /insert into public\.audit_logs/i.test(sql)
);
assert(
  "returns status pending and USD",
  sql.includes("'status', 'pending'") && sql.includes("'currency', 'USD'")
);

console.log("\n== Uniqueness and idempotency ==");
assert(
  "creates a unique index on orders.order_number",
  sql.includes("create unique index orders_order_number_key")
);
assert(
  "checks for duplicate order numbers before creating the index",
  sql.includes("duplicate order_number values exist")
);
assert(
  "adds checkout_idempotency_key + payload hash columns",
  sql.includes("checkout_idempotency_key text") &&
    sql.includes("checkout_payload_hash text")
);
assert(
  "enforces uniqueness per (user_id, idempotency key)",
  sql.includes("orders_user_idempotency_key_uidx") &&
    /on public\.orders \(user_id, checkout_idempotency_key\)/.test(sql) &&
    /where checkout_idempotency_key is not null/.test(sql)
);
assert(
  "hashes a canonical payload",
  sql.includes("sha256(convert_to(v_canonical::text, 'UTF8'))") &&
    /order by pairs\.variant_id/.test(sql)
);
assert(
  "replays the original order for the same key + payload",
  sql.includes("'replayed', true")
);
assert(
  "rejects the same key with a different payload",
  sql.includes("IDEMPOTENCY_CONFLICT||") &&
    sql.includes("checkout_payload_hash is distinct from v_payload_hash")
);
assert(
  "re-checks idempotency after acquiring variant locks",
  /Re-check after acquiring them[\s\S]*?where o\.user_id = v_actor_id[\s\S]*?and o\.checkout_idempotency_key = v_key/i.test(
    sql
  )
);
assert(
  "uses ON CONFLICT DO NOTHING and retries order-number collisions",
  /on conflict do nothing/i.test(sql) &&
    sql.includes("v_max_attempts") &&
    sql.includes("ORDER_NUMBER_GENERATION_FAILED||")
);

console.log("\n== Direct-write closure and privileges ==");
assert(
  "removes every INSERT policy on orders/order_items",
  /tablename in \('orders', 'order_items'\)[\s\S]*?cmd = 'INSERT'/.test(sql)
);
assert(
  "revokes INSERT on orders from PUBLIC",
  sql.includes("revoke insert on public.orders from public;")
);
assert(
  "revokes INSERT on order_items from PUBLIC",
  sql.includes("revoke insert on public.order_items from public;")
);
assert(
  "revokes INSERT on orders from anon/authenticated",
  sql.includes("revoke insert on public.orders from anon, authenticated;")
);
assert(
  "revokes INSERT on order_items from anon/authenticated",
  sql.includes("revoke insert on public.order_items from anon, authenticated;")
);
assert(
  "grants execute to authenticated and service_role only",
  sql.includes(
    "grant execute on function public.create_order(text, jsonb, jsonb, text, text) to authenticated;"
  ) &&
    sql.includes(
      "grant execute on function public.create_order(text, jsonb, jsonb, text, text) to service_role;"
    ) &&
    sql.includes(
      "revoke all on function public.create_order(text, jsonb, jsonb, text, text) from anon;"
    )
);
assert(
  "self-verification asserts authenticated can no longer INSERT",
  sql.includes("has_table_privilege('authenticated', 'public.orders', 'INSERT')") &&
    sql.includes("has_table_privilege('authenticated', 'public.order_items', 'INSERT')")
);
assert(
  "self-verification keeps service_role INSERT",
  sql.includes("has_table_privilege('service_role', 'public.orders', 'INSERT')") &&
    sql.includes("has_table_privilege('service_role', 'public.order_items', 'INSERT')")
);
assert(
  "self-verification asserts anon cannot execute the RPC",
  sql.includes("has_function_privilege('anon'")
);

console.log("\n== Application wiring ==");
const ordersLib = read("../lib/orders.ts");
assert(
  "createOrder calls the create_order RPC",
  ordersLib.includes('.rpc("create_order"')
);
assert(
  "passes only the intended RPC arguments",
  ["p_email", "p_shipping_address", "p_items", "p_idempotency_key", "p_notes"].every(
    (name) => ordersLib.includes(`${name}:`)
  )
);
assert(
  "no longer inserts orders/order_items directly",
  !/\.from\("orders"\)\s*\.insert/.test(ordersLib) &&
    !/\.from\("order_items"\)\s*\.insert/.test(ordersLib)
);
assert(
  "no longer mutates stock directly",
  !/\.from\("product_variants"\)\s*\.update/.test(ordersLib)
);
assert(
  "no longer uses the secret-key client for order creation",
  !ordersLib.includes("createAdminClient")
);
assert(
  "maps coded RPC errors to checkout messages",
  ordersLib.includes("createOrderErrorMessage")
);
assert(
  "CreateOrderInput requires an idempotency key",
  /interface CreateOrderInput[\s\S]*?idempotencyKey: string;/.test(ordersLib)
);

const action = read("../app/actions/orders.ts");
assert(
  "the server action forwards the idempotency key",
  action.includes("idempotencyKey: validated.data.idempotencyKey")
);

const validation = read("../lib/validations/order.ts");
assert(
  "the checkout schema validates the idempotency key",
  validation.includes("checkoutIdempotencyKeySchema") &&
    /idempotencyKey:\s*checkoutIdempotencyKeySchema/.test(validation)
);
assert(
  "the checkout schema bounds cart lines",
  validation.includes('.max(100, "Your cart contains too many items")')
);

const idempotency = read("../lib/checkout-idempotency.ts");
assert(
  "the signature is order-independent and normalized",
  idempotency.includes("sort(") &&
    idempotency.includes("toLowerCase()") &&
    idempotency.includes("trim()")
);
assert(
  "retries reuse the key and payload changes rotate it",
  idempotency.includes("nextCheckoutIdempotencyState") &&
    idempotency.includes("previous.signature === signature")
);
assert(
  "a pending key is persisted across reloads",
  idempotency.includes("CHECKOUT_IDEMPOTENCY_STORAGE_KEY") &&
    idempotency.includes("readStoredCheckoutIdempotency") &&
    idempotency.includes("storeCheckoutIdempotency") &&
    idempotency.includes("clearStoredCheckoutIdempotency")
);
assert(
  "restored keys are validated against the database key contract",
  idempotency.includes("/^[A-Za-z0-9._:-]{8,128}$/") &&
    idempotency.includes("isValidCheckoutIdempotencyKey")
);

const form = read("../components/checkout/checkout-form.tsx");
assert(
  "the checkout form uses the idempotency helpers",
  form.includes("checkoutPayloadSignature") &&
    form.includes("nextCheckoutIdempotencyState") &&
    form.includes("createCheckoutIdempotencyKey")
);
assert(
  "the checkout form restores and clears the stored key",
  form.includes("readStoredCheckoutIdempotency") &&
    form.includes("storeCheckoutIdempotency") &&
    form.includes("clearStoredCheckoutIdempotency") &&
    form.includes("window.sessionStorage")
);
assert(
  "the success handler clears the in-memory key before navigating",
  /if \(result\.success && result\.orderNumber\)[\s\S]*?idempotencyRef\.current = null;[\s\S]*?clearStoredCheckoutIdempotency/.test(
    form
  )
);
assert(
  "the checkout form sends the generated key",
  form.includes("idempotencyKey: idempotency.state.key")
);
assert(
  "the form keeps the key in a ref across retries",
  form.includes("useRef<CheckoutIdempotencyState | null>(null)")
);

console.log("\n== Summary ==");
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
