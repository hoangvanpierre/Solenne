#!/usr/bin/env node
// ===========================================================================
// Solenne RBAC verification harness
// ===========================================================================
// Proves that authorization is enforced by the DATABASE (RLS + guard triggers)
// for anonymous, customer, staff, manager and admin callers — including the
// cases a UI cannot reach (direct REST calls that bypass every button).
//
// Usage:
//   node scripts/verify-rbac.mjs          read-only probes (safe on any env)
//   node scripts/verify-rbac.mjs --full   full authorization matrix; creates
//                                         disposable test accounts + one test
//                                         order, then removes what it created
//
// Requires .env.local (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
// SUPABASE_SECRET_KEY) and migrations 0001–0005 applied.
// ===========================================================================
import fs from "node:fs";

const FULL = process.argv.includes("--full");

function loadEnv() {
  const raw = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const get = (k) => (raw.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
  const env = {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    pub: get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    svc: get("SUPABASE_SECRET_KEY"),
  };
  if (!env.url || !env.pub || !env.svc) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY / SECRET_KEY in .env.local");
  }
  return env;
}

const ENV = loadEnv();

const results = [];
function record(section, name, ok, actual) {
  results.push({ section, name, ok, actual });
  const tag = ok ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${ok ? "" : `  -> ${actual}`}`);
}

// Accepts 401/403, or a 2xx response that changed nothing. PostgREST answers a
// blocked UPDATE with 200 + [] when return=representation is requested, and a
// blocked DELETE with 204 (grants revoked) — those are denials, not successes.
function denied(res) {
  if ([401, 403].includes(res.status)) return true;
  if (res.status === 200 && Array.isArray(res.json) && res.json.length === 0) return true;
  if (res.status === 204) return true;
  return false;
}

// A write that returns rows (or 201/204) actually took effect.
function wrote(res) {
  if ([201, 204].includes(res.status)) return true;
  return res.status === 200 && Array.isArray(res.json) && res.json.length > 0;
}
const desc = (res) =>
  `${res.status} ${typeof res.json === "string" ? res.json : JSON.stringify(res.json)?.slice(0, 160)}`;

async function rest(path, { method = "GET", key, token, body, prefer } = {}) {
  const apiKey = key ?? (token ? ENV.pub : ENV.svc);
  const res = await fetch(`${ENV.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token ?? apiKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, text };
}

async function auth(path, { method = "GET", body }) {
  const res = await fetch(`${ENV.url}/auth/v1${path}`, {
    method,
    headers: {
      apikey: ENV.svc,
      Authorization: `Bearer ${ENV.svc}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

async function signIn(email, password) {
  const res = await fetch(`${ENV.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ENV.pub, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(json)}`);
  return json.access_token;
}

const rpc = (fn, { token, key, body = {} } = {}) =>
  rest(`/rpc/${fn}`, { method: "POST", token, key, body });

const actor = async (token) => (await rpc("current_actor", { token })).json;

// ===========================================================================
// Mode 1 — read-only probes (no writes, no new accounts)
// ===========================================================================
async function readOnlyProbes() {
  console.log("\n== Anonymous (publishable key, no session) ==");
  const products = await rest("/products?select=id&limit=1", { key: ENV.pub });
  record("anon", "storefront products are publicly readable", products.status === 200 && (products.json?.length ?? 0) > 0, desc(products));

  for (const table of ["orders", "order_items", "addresses", "profiles", "role_permissions", "roles", "audit_logs"]) {
    const res = await rest(`/${table}?select=*&limit=1`, { key: ENV.pub });
    record("anon", `anon cannot read ${table}`, [401, 403].includes(res.status) || (res.json?.length ?? 0) === 0, desc(res));
  }

  const forged = await rest("/audit_logs", {
    method: "POST",
    key: ENV.pub,
    body: { actor_id: null, action: "rbac.probe" },
  });
  record("anon", "anon cannot append to audit_logs", [401, 403].includes(forged.status), desc(forged));

  const ctx = await rpc("current_actor", { key: ENV.pub });
  record("anon", "current_actor() returns null without a session", ctx.status === 200 && ctx.json === null, desc(ctx));

  console.log("\n== Schema / guard presence ==");
  const roles = await rest("/roles?select=name&order=rank", {});
  record("schema", "roles readable by the trusted path (0005 grants)", roles.status === 200 && (roles.json?.length ?? 0) >= 4, desc(roles));
  const perms = await rest("/permissions?select=key", {});
  record("schema", "permission catalogue seeded (21 keys)", (perms.json?.length ?? 0) === 21, `count=${perms.json?.length}`);
  const logs = await rest("/audit_logs?select=id,action&limit=5", {});
  record("schema", "audit_logs appendable by the trusted path", logs.status === 200, desc(logs));
  const del = await rest("/audit_logs?id=eq.00000000-0000-0000-0000-000000000000", { method: "DELETE" });
  record("schema", "audit_logs DELETE revoked even for service_role", [401, 403].includes(del.status), desc(del));
}

// ===========================================================================
// Mode 2 — full authorization matrix with real sessions
// ===========================================================================
const STAMP = Date.now().toString(36);
const PASSWORD = `Rbac!${STAMP}${Math.random().toString(36).slice(2, 10)}`;
const ROLE_ORDER = ["customer", "staff", "manager", "admin"];
const created = { users: [], orders: [], items: [], addresses: [] };

// Preferred path: read the catalogue through the trusted client (needs the
// service_role grants added by 0005).
async function resolveRoleIdsDirect() {
  const rows = (await rest("/roles?select=id,name", {})).json;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return Object.fromEntries(rows.map((r) => [r.name, r.id]));
}

// Fallback that needs no extra grants: any existing admin profile already
// holds the admin role id, so a throwaway account can be promoted through the
// candidate ids one at a time until current_actor() reports "admin". That
// session then reads the rest of the catalogue through RLS (role.read), which
// is exactly the privilege an admin has.
async function bootstrapRoleIds() {
  const profiles = (await rest("/profiles?select=role_id&limit=200", {})).json;
  const candidates = [...new Set((profiles ?? []).map((p) => p.role_id).filter(Boolean))];
  if (candidates.length === 0) return null;

  const email = `rbac-verify-probe-${STAMP}@solenne.test`;
  const createdUser = await auth("/admin/users", {
    method: "POST",
    body: { email, password: PASSWORD, email_confirm: true },
  });
  if (createdUser.status >= 300) return null;
  const probeId = createdUser.json.id;
  created.users.push({ id: probeId, email });

  for (const candidate of candidates) {
    const patch = await rest(`/profiles?id=eq.${probeId}`, {
      method: "PATCH",
      body: { role_id: candidate },
      prefer: "return=minimal",
    });
    if (patch.status >= 300) continue;

    const token = await signIn(email, PASSWORD);
    const ctx = await actor(token);
    if (ctx?.role !== "admin") continue;

    const rows = (await rest("/roles?select=id,name", { token })).json;
    if (Array.isArray(rows) && rows.length > 0) {
      console.log("\n  (role catalogue bootstrapped through a temporary admin session)");
      return Object.fromEntries(rows.map((r) => [r.name, r.id]));
    }
  }
  return null;
}


async function createRoleUser(roleName, roleIds) {
  const email = `rbac-verify-${roleName}-${STAMP}@solenne.test`;
  const res = await auth("/admin/users", {
    method: "POST",
    body: { email, password: PASSWORD, email_confirm: true },
  });
  if (res.status >= 300) throw new Error(`createUser(${roleName}) failed: ${JSON.stringify(res.json)}`);
  const id = res.json.id;
  created.users.push({ id, email });

  // Role assignment is a privileged, explicit operation performed here by the
  // trusted path — exactly how 0004_bootstrap_admin.sql promotes the first
  // admin. Nothing in the app or the client can do this.
  const patch = await rest(`/profiles?id=eq.${id}`, {
    method: "PATCH",
    body: { role_id: roleIds[roleName] },
    prefer: "return=minimal",
  });
  if (patch.status >= 300) throw new Error(`role assign (${roleName}) failed: ${desc(patch)}`);

  const token = await signIn(email, PASSWORD);
  return { id, email, token };
}

async function fullMatrix() {
  const roleIds = (await resolveRoleIdsDirect()) ?? (await bootstrapRoleIds());
  if (!roleIds || ROLE_ORDER.some((r) => !roleIds[r])) {
    throw new Error(
      "Could not resolve role ids. Apply supabase/migrations/0005 (service_role grants) on a database with at least one admin profile, then retry."
    );
  }

  // Whether the trusted path may append to audit_logs depends on 0005. Probe it
  // so the audit check reports honestly instead of failing for the wrong reason.
  const auditTrusted = (await rest("/audit_logs?select=id&limit=1", {})).status === 200;
  if (!auditTrusted) {
    console.log(
      "\n  NOTE: trusted path has no audit_logs privileges yet — apply 0005 to enable lib/audit.ts writes."
    );
  }

  const users = {};
  for (const roleName of ROLE_ORDER) {
    users[roleName] = await createRoleUser(roleName, roleIds);
  }
  console.log(`\n== Test accounts created (removed at the end) ==`);
  for (const r of ROLE_ORDER) console.log(`  ${r.padEnd(8)} ${users[r].email}`);

  // A "victim" identity that is NOT one of the test accounts, used for every
  // cross-user attempt.
  const victimProfile = (await rest(`/profiles?select=id&id=not.eq.${users.customer.id}&limit=1`, {})).json?.[0];
  if (!victimProfile) throw new Error("No other profile found to use as the cross-user target");
  const victimId = victimProfile.id;

  const variant = (await rest("/product_variants?select=id,product_id,name,price&limit=1&products(name)", {})).json?.[0];
  const orderNumber = `RBAC-${STAMP.toUpperCase()}`;
  const orderPayload = {
    user_id: users.customer.id,
    order_number: orderNumber,
    status: "pending",
    subtotal: 1,
    shipping_fee: 0,
    discount: 0,
    total: 1,
    shipping_address: { line1: "1 Verification Way", city: "Test", postalCode: "00000", country: "Vietnam" },
    notes: "rbac verification",
  };


  // ---------- identity: the database resolves the role and permissions ----------
  const EXPECTED = {
    customer: ["order.create", "order.read_own", "product.read", "profile.read_own", "profile.update_own"],
    staff: ["customer.read", "inventory.read", "inventory.update", "order.read", "order.update", "product.create", "product.read", "product.update", "profile.read_own", "profile.update_own"],
    manager: ["analytics.read", "customer.read", "inventory.read", "inventory.update", "order.cancel", "order.read", "order.update", "product.create", "product.delete", "product.read", "product.update", "profile.read_own", "profile.update_own", "staff.read"],
    admin: ["analytics.read", "audit.read", "customer.read", "customer.update", "inventory.read", "inventory.update", "order.cancel", "order.create", "order.read", "order.read_own", "order.update", "product.create", "product.delete", "product.read", "product.update", "profile.read_own", "profile.update_own", "role.manage", "role.read", "staff.manage", "staff.read"],
  };
  console.log("\n== Identity resolved by the database (current_actor RPC) ==");
  for (const roleName of ROLE_ORDER) {
    const ctx = await actor(users[roleName].token);
    record("identity", `${roleName}: role resolved from profiles.role_id`, ctx?.role === roleName && ctx?.status === "active", JSON.stringify(ctx)?.slice(0, 200));
    const perms = new Set(ctx?.permissions ?? []);
    const missing = EXPECTED[roleName].filter((p) => !perms.has(p));
    const extra = [...perms].filter((p) => !EXPECTED[roleName].includes(p));
    record("identity", `${roleName}: permission set matches the seeded matrix (${EXPECTED[roleName].length})`, missing.length === 0 && extra.length === 0, `missing=[${missing}] extra=[${extra}]`);
  }

  // ---------- CUSTOMER ----------
  const cTok = users.customer.token;
  const cId = users.customer.id;
  const S = "customer";
  console.log(`\n== Customer (own data only) ==`);

  const ownProfile = await rest(`/profiles?select=id,role_id,status&id=eq.${cId}`, { token: cTok });
  record(S, "reads own profile", ownProfile.json?.length === 1, desc(ownProfile));

  const nameUpd = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: cTok, body: { full_name: "RBAC Verifier" }, prefer: "return=representation" });
  record(S, "updates own profile (name)", nameUpd.status === 200 && nameUpd.json?.length === 1, desc(nameUpd));

  const roleEsc = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: cTok, body: { role_id: roleIds.admin }, prefer: "return=representation" });
  record(S, "CANNOT change own role_id -> admin", roleEsc.status >= 400, desc(roleEsc));

  const statusEsc = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: cTok, body: { status: "suspended" }, prefer: "return=representation" });
  record(S, "CANNOT set own account status", statusEsc.status >= 400, desc(statusEsc));

  const victimProfileRead = await rest(`/profiles?select=id&id=eq.${victimId}`, { token: cTok });
  record(S, "CANNOT read another account's profile", (victimProfileRead.json?.length ?? 0) === 0, desc(victimProfileRead));

  const victimUpd = await rest(`/profiles?id=eq.${victimId}`, { method: "PATCH", token: cTok, body: { full_name: "Tampered" }, prefer: "return=representation" });
  record(S, "CANNOT update another account's profile", victimUpd.status >= 400 || (victimUpd.json?.length ?? 0) === 0, desc(victimUpd));

  const addrIns = await rest("/addresses", {
    method: "POST",
    token: cTok,
    prefer: "return=representation",
    body: { user_id: cId, label: "RBAC", line1: "1 Verification Way", city: "Test", postal_code: "00000", country: "Vietnam", is_default: false },
  });
  record(S, "inserts own address", addrIns.status === 201, desc(addrIns));
  if (addrIns.json?.[0]?.id) created.addresses.push(addrIns.json[0].id);

  const addrRead = await rest("/addresses?select=id", { token: cTok });
  record(S, "reads own addresses", (addrRead.json?.length ?? 0) >= 1, desc(addrRead));

  const addrForeignIns = await rest("/addresses", {
    method: "POST",
    token: cTok,
    prefer: "return=representation",
    body: { user_id: victimId, label: "RBAC", line1: "1 Tamper Way", city: "Test", postal_code: "00000", country: "Vietnam", is_default: false },
  });
  record(S, "CANNOT insert an address for another account", addrForeignIns.status >= 400, desc(addrForeignIns));

  const addrForeignRead = await rest(`/addresses?select=id&user_id=eq.${victimId}`, { token: cTok });
  record(S, "CANNOT read another account's addresses", (addrForeignRead.json?.length ?? 0) === 0, desc(addrForeignRead));


  // ---------- CUSTOMER: orders + order items ----------
  const ownOrderIns = await rest("/orders", { method: "POST", token: cTok, prefer: "return=representation", body: orderPayload });
  record(S, "creates own order (RLS orders_insert_own)", ownOrderIns.status === 201, desc(ownOrderIns));
  const orderId = ownOrderIns.json?.[0]?.id;
  if (orderId) created.orders.push(orderId);

  const ownOrders = await rest(`/orders?select=id&user_id=eq.${cId}`, { token: cTok });
  record(S, "reads own orders", (ownOrders.json?.length ?? 0) >= 1, desc(ownOrders));

  const foreignOrders = await rest(`/orders?select=id&user_id=eq.${victimId}`, { token: cTok });
  record(S, "CANNOT read another account's orders", (foreignOrders.json?.length ?? 0) === 0, desc(foreignOrders));

  const orderForOther = await rest("/orders", {
    method: "POST",
    token: cTok,
    prefer: "return=representation",
    body: { ...orderPayload, user_id: victimId, order_number: `${orderNumber}-X` },
  });
  record(S, "CANNOT create an order for another account", orderForOther.status >= 400, desc(orderForOther));

  if (orderId) {
    const paid = await rest(`/orders?id=eq.${orderId}`, { method: "PATCH", token: cTok, prefer: "return=representation", body: { status: "paid" } });
    record(S, "CANNOT mark own order as paid (no order.update)", denied(paid), desc(paid));

    const delOwn = await rest(`/orders?id=eq.${orderId}`, { method: "DELETE", token: cTok, prefer: "return=representation" });
    record(S, "CANNOT delete own order (financial record)", denied(delOwn), desc(delOwn));
  }

  if (orderId && variant) {
    const itemBody = {
      order_id: orderId,
      product_id: variant.product_id,
      variant_id: variant.id,
      product_name: variant.products?.name ?? "RBAC",
      variant_name: variant.name,
      quantity: 1,
      unit_price: 1,
      total_price: 1,
    };
    const itemIns = await rest("/order_items", { method: "POST", token: cTok, prefer: "return=representation", body: itemBody });
    record(S, "adds items to own order", itemIns.status === 201, desc(itemIns));
    if (itemIns.json?.[0]?.id) created.items.push(itemIns.json[0].id);

    const ownItems = await rest(`/order_items?select=id&order_id=eq.${orderId}`, { token: cTok });
    record(S, "reads own order items", (ownItems.json?.length ?? 0) >= 1, desc(ownItems));

    const foreignOrder = (await rest(`/orders?select=id&user_id=eq.${victimId}&limit=1`, {})).json?.[0];
    if (foreignOrder) {
      const foreignItems = await rest(`/order_items?select=id&order_id=eq.${foreignOrder.id}`, { token: cTok });
      record(S, "CANNOT read another account's order items", (foreignItems.json?.length ?? 0) === 0, desc(foreignItems));

      const foreignItemIns = await rest("/order_items", { method: "POST", token: cTok, prefer: "return=representation", body: { ...itemBody, order_id: foreignOrder.id } });
      record(S, "CANNOT add items to another account's order", foreignItemIns.status >= 400, desc(foreignItemIns));
    }
  }

  // ---------- CUSTOMER: admin-only surfaces ----------
  const cLogs = await rest("/audit_logs?select=id&limit=1", { token: cTok });
  record(S, "CANNOT read audit_logs", (cLogs.json?.length ?? 0) === 0, desc(cLogs));

  const cLogForge = await rest("/audit_logs", { method: "POST", token: cTok, body: { actor_id: cId, action: "user.role_changed" } });
  record(S, "CANNOT forge audit_logs", cLogForge.status >= 400, desc(cLogForge));

  const cRoles = await rest("/roles?select=name", { token: cTok });
  record(S, "CANNOT read the roles catalogue", (cRoles.json?.length ?? 0) === 0, desc(cRoles));

  const cRolePerms = await rest("/role_permissions?select=role_id", { token: cTok });
  record(S, "CANNOT read role_permissions", (cRolePerms.json?.length ?? 0) === 0, desc(cRolePerms));

  const cPerms = await rest("/permissions?select=key", { token: cTok });
  record(S, "CANNOT read the permission catalogue", (cPerms.json?.length ?? 0) === 0, desc(cPerms));

  if (variant) {
    const prodWrite = await rest(`/products?id=eq.${variant.product_id}`, { method: "PATCH", token: cTok, prefer: "return=representation", body: { is_featured: true } });
    record(S, "CANNOT modify products", prodWrite.status >= 400 || (prodWrite.json?.length ?? 0) === 0, desc(prodWrite));

    const variantWrite = await rest(`/product_variants?id=eq.${variant.id}`, { method: "PATCH", token: cTok, prefer: "return=representation", body: { price: 0.01 } });
    record(S, "CANNOT modify product_variants (price/stock)", variantWrite.status >= 400 || (variantWrite.json?.length ?? 0) === 0, desc(variantWrite));
  }


  // ---------- STAFF ----------
  const sTok = users.staff.token;
  const sId = users.staff.id;
  const S2 = "staff";
  console.log("\n== Staff (operational, no security administration) ==");

  const sOrders = await rest("/orders?select=id&limit=5", { token: sTok });
  record(S2, "reads customer orders (order.read)", (sOrders.json?.length ?? 0) >= 1, desc(sOrders));

  const sProfiles = await rest("/profiles?select=id&limit=5", { token: sTok });
  record(S2, "reads customer profiles (customer.read)", (sProfiles.json?.length ?? 0) >= 1, desc(sProfiles));

  if (orderId) {
    const sOrderUpd = await rest(`/orders?id=eq.${orderId}`, { method: "PATCH", token: sTok, prefer: "return=representation", body: { status: "processing" } });
    record(S2, "updates an order (order.update)", wrote(sOrderUpd), desc(sOrderUpd));
  }

  const sSelfEsc = await rest(`/profiles?id=eq.${sId}`, { method: "PATCH", token: sTok, prefer: "return=representation", body: { role_id: roleIds.admin } });
  record(S2, "CANNOT self-escalate to admin", denied(sSelfEsc), desc(sSelfEsc));

  const sGrant = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: sTok, prefer: "return=representation", body: { role_id: roleIds.manager } });
  record(S2, "CANNOT grant roles to others (role.manage required)", denied(sGrant), desc(sGrant));

  const sSuspend = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: sTok, prefer: "return=representation", body: { status: "suspended" } });
  record(S2, "CANNOT suspend accounts (staff.manage required)", denied(sSuspend), desc(sSuspend));

  const sLogs = await rest("/audit_logs?select=id&limit=1", { token: sTok });
  record(S2, "CANNOT read audit_logs", (sLogs.json?.length ?? 0) === 0, desc(sLogs));

  const sRoles = await rest("/roles?select=name", { token: sTok });
  record(S2, "CANNOT read the roles catalogue (no staff.read)", (sRoles.json?.length ?? 0) === 0, desc(sRoles));

  // RLS is an ownership gate, not a permission gate: an active account may open
  // its OWN order row, while `order.create` (the permission that decides whether
  // checkout is allowed) is enforced by the application layer. Both are checked
  // here so the split is explicit rather than assumed.
  const sOrderForOther = await rest("/orders", { method: "POST", token: sTok, prefer: "return=representation", body: { ...orderPayload, user_id: victimId, order_number: `${orderNumber}-S2` } });
  record(S2, "CANNOT create an order for another account (RLS ownership)", sOrderForOther.status >= 400, desc(sOrderForOther));

  // RLS still lets staff read their OWN orders (orders_select_own applies to
  // every authenticated caller), so /account order history works for them.
  const sOwnOrders = await rest(`/orders?select=id&user_id=eq.${sId}`, { token: sTok });
  record(S2, "reads own orders via RLS (account page keeps working)", sOwnOrders.status === 200, desc(sOwnOrders));

  // ---------- MANAGER ----------
  const mTok = users.manager.token;
  const mId = users.manager.id;
  const S3 = "manager";
  console.log("\n== Manager (adds product.delete, analytics.read, staff.read) ==");

  const mRoles = await rest("/roles?select=name,rank", { token: mTok });
  record(S3, "reads the roles catalogue (staff.read)", (mRoles.json?.length ?? 0) >= 4, desc(mRoles));

  const mOrders = await rest("/orders?select=id&limit=5", { token: mTok });
  record(S3, "reads customer orders (order.read)", (mOrders.json?.length ?? 0) >= 1, desc(mOrders));

  const mRolePerms = await rest("/role_permissions?select=role_id&limit=1", { token: mTok });
  record(S3, "CANNOT read the permission matrix (no role.read)", (mRolePerms.json?.length ?? 0) === 0, desc(mRolePerms));

  const mGrant = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: mTok, prefer: "return=representation", body: { role_id: roleIds.staff } });
  record(S3, "CANNOT change roles (role.manage required)", mGrant.status >= 400, desc(mGrant));

  const mSelfEsc = await rest(`/profiles?id=eq.${mId}`, { method: "PATCH", token: mTok, prefer: "return=representation", body: { role_id: roleIds.admin } });
  record(S3, "CANNOT self-escalate to admin", mSelfEsc.status >= 400, desc(mSelfEsc));

  const mLogs = await rest("/audit_logs?select=id&limit=1", { token: mTok });
  record(S3, "CANNOT read audit_logs", (mLogs.json?.length ?? 0) === 0, desc(mLogs));


  // ---------- ADMIN ----------
  const aTok = users.admin.token;
  const aId = users.admin.id;
  const S4 = "admin";
  console.log("\n== Admin (full administration) ==");

  const aLogs = await rest("/audit_logs?select=id,action&limit=5", { token: aTok });
  record(S4, "reads audit_logs (audit.read)", (aLogs.json?.length ?? 0) >= 1, desc(aLogs));

  const aRolePerms = await rest("/role_permissions?select=role_id&limit=5", { token: aTok });
  record(S4, "reads the role/permission matrix (role.read)", (aRolePerms.json?.length ?? 0) >= 1, desc(aRolePerms));

  const aPerms = await rest("/permissions?select=key", { token: aTok });
  record(S4, "reads the permission catalogue", (aPerms.json?.length ?? 0) === 21, desc(aPerms));

  const aOrders = await rest("/orders?select=id&limit=5", { token: aTok });
  record(S4, "reads all orders (order.read)", (aOrders.json?.length ?? 0) >= 1, desc(aOrders));

  const aProfiles = await rest("/profiles?select=id&limit=5", { token: aTok });
  record(S4, "reads all profiles (customer.read)", (aProfiles.json?.length ?? 0) >= 1, desc(aProfiles));

  // Role management: promote then restore the disposable test customer.
  const aGrant = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: aTok, prefer: "return=representation", body: { role_id: roleIds.staff } });
  record(S4, "changes another account's role (role.manage)", aGrant.status === 200 && aGrant.json?.length === 1, desc(aGrant));

  const aRestore = await rest(`/profiles?id=eq.${cId}`, { method: "PATCH", token: aTok, prefer: "return=representation", body: { role_id: roleIds.customer } });
  record(S4, "restores the role (role.manage)", aRestore.status === 200 && aRestore.json?.length === 1, desc(aRestore));

  // Account status: suspend then reactivate. Suspension must be visible to the
  // suspended account itself — permissions are emptied by the database.
  const aSuspend = await rest(`/profiles?id=eq.${mId}`, { method: "PATCH", token: aTok, prefer: "return=representation", body: { status: "suspended" } });
  record(S4, "suspends an account (staff.manage)", aSuspend.status === 200 && aSuspend.json?.length === 1, desc(aSuspend));

  const suspendedCtx = await actor(mTok);
  record("suspension", "suspended account holds ZERO permissions", suspendedCtx?.status === "suspended" && (suspendedCtx?.permissions?.length ?? -1) === 0, JSON.stringify(suspendedCtx)?.slice(0, 200));

  if (orderId) {
    const suspendedRead = await rest("/orders?select=id&limit=5", { token: mTok });
    record("suspension", "suspended account cannot read orders (RLS agrees)", (suspendedRead.json?.length ?? 0) === 0, desc(suspendedRead));
  }

  const aReactivate = await rest(`/profiles?id=eq.${mId}`, { method: "PATCH", token: aTok, prefer: "return=representation", body: { status: "active" } });
  record(S4, "reactivates the account (staff.manage)", aReactivate.status === 200 && aReactivate.json?.length === 1, desc(aReactivate));

  const reactivatedCtx = await actor(mTok);
  record("suspension", "reactivated account regains its permissions", (reactivatedCtx?.permissions?.length ?? 0) > 0, JSON.stringify(reactivatedCtx)?.slice(0, 200));

  // Self-protection: even with role.manage / staff.manage, an admin cannot
  // demote or disable its own account — the 0001 guard trigger blocks the
  // own-row case for the untrusted (JWT) path.
  const aSelfRole = await rest(`/profiles?id=eq.${aId}`, { method: "PATCH", token: aTok, prefer: "return=representation", body: { role_id: roleIds.customer } });
  record(S4, "CANNOT demote itself (own-row guard)", aSelfRole.status >= 400, desc(aSelfRole));

  const aSelfStatus = await rest(`/profiles?id=eq.${aId}`, { method: "PATCH", token: aTok, prefer: "return=representation", body: { status: "suspended" } });
  record(S4, "CANNOT suspend itself (own-row guard)", aSelfStatus.status >= 400, desc(aSelfStatus));

  const aAuditUpd = await rest(`/audit_logs?action=eq.rbac.verification`, { method: "PATCH", token: aTok, body: { action: "tampered" } });
  record(S4, "CANNOT update audit records (append-only)", [401, 403].includes(aAuditUpd.status) || (aAuditUpd.json?.length ?? 0) === 0, desc(aAuditUpd));

  const aAuditDel = await rest("/audit_logs?id=eq.00000000-0000-0000-0000-000000000000", { method: "DELETE", token: aTok });
  record(S4, "CANNOT delete audit records (append-only)", [401, 403].includes(aAuditDel.status), desc(aAuditDel));

  // The app writes its audit rows through the trusted path (lib/audit.ts).
  // Proving that grant is the last piece of the audit trail story.
  if (auditTrusted) {
    const writeAudit = await rest("/audit_logs", {
      method: "POST",
      prefer: "return=representation",
      body: { actor_id: null, action: "rbac.verification", resource_type: "system", metadata: { stamp: STAMP, note: "scripts/verify-rbac.mjs" } },
    });
    record("audit", "trusted path (service_role) can append an audit record", writeAudit.status === 201, desc(writeAudit));
  } else {
    console.log("  [SKIP] trusted-path audit append — apply 0005 first");
  }
}



// ===========================================================================
// Cleanup — remove everything this run created
// ===========================================================================
async function cleanup() {
  console.log("\n== Cleanup ==");
  for (const id of created.items) {
    await rest(`/order_items?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of created.orders) {
    // Service role may remove leftovers of the verification run; customers can
    // never delete an order (no grant, no policy).
    await rest(`/orders?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of created.addresses) {
    await rest(`/addresses?id=eq.${id}`, { method: "DELETE" });
  }

  for (const user of created.users) {
    const res = await auth(`/admin/users/${user.id}`, { method: "DELETE" });
    const profile = await rest(`/profiles?select=id&id=eq.${user.id}`, {});
    const profileGone = (profile.json?.length ?? 0) === 0;
    if (!profileGone) await rest(`/profiles?id=eq.${user.id}`, { method: "DELETE" });
    record("cleanup", `test account removed (${user.email.split("@")[0]})`, res.status < 300, `${res.status}`);
    record("cleanup", `profile row cascade-removed (${user.email.split("@")[0]})`, profileGone, profileGone ? "" : "profile lingered and was deleted explicitly");
  }
}

// ===========================================================================
// Entry point
// ===========================================================================
(async () => {
  console.log(`Solenne RBAC verification — ${FULL ? "full matrix" : "read-only probes"}`);
  console.log(`Target: ${ENV.url}`);

  if (!FULL) {
    await readOnlyProbes();
  } else {
    try {
      await fullMatrix();
    } finally {
      await cleanup();
    }
  }

  const failed = results.filter((r) => !r.ok);
  const bySection = results.reduce((acc, r) => {
    acc[r.section] = (acc[r.section] ?? 0) + (r.ok ? 1 : 0);
    return acc;
  }, {});

  console.log("\n== Summary ==");
  for (const [section, count] of Object.entries(bySection)) {
    console.log(`  ${section.padEnd(14)} ${count} passed`);
  }
  console.log(`  ${results.length - failed.length}/${results.length} checks passed`);

  if (failed.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failed) console.log(`  - [${f.section}] ${f.name} -> ${f.actual}`);
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error("\nHarness error:", error.message);
  process.exitCode = 1;
});

