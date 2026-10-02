#!/usr/bin/env node
// ===========================================================================
// Solenne — stale RBAC verification data cleanup  (DRY RUN BY DEFAULT)
// ===========================================================================
// Removes ONLY the residue of earlier RBAC verification runs, frozen as a
// baseline by the read-only investigation of 2026-09-25:
//
//   54 Auth users   email starts with "rbac-verify-"
//    2 profiles     c6b2d692-3f38-40bc-a97f-657ed1115d11  (staff, active)
//                   e6010082-8e7a-4abc-bd05-2474839dd996  (staff, active)
//    2 orders (ORIGINAL known set — resumable, see EXPECTED.orders below)
//                   RBAC-MUD1I8IX-S   e5e330e5-11a6-47e0-b4ba-84fae3e39634
//                   RBAC-MUFRHQIN-S2  80287f63-21b7-4f8b-b28b-8b42e490edc1
//                 An already-absent EXPECTED order is reported as
//                 "already cleaned", never recreated; only orders still present
//                 are pending cleanup.
//    0 addresses    (the 2 existing rows belong to real accounts)
//    0 order_items  (the 19 existing rows belong to real orders)
//
// Safety posture
//   * Hard gates run FIRST. If any gate fails the script ABORTS (exit 1)
//     before it plans anything, and no request beyond read-only GETs is sent.
//   * The default mode is a DRY RUN: read-only GET requests only.
//   * Deleting requires the explicit --execute flag AND every gate passing.
//   * audit_logs is never touched — it is an append-only trail with no FK on
//     actor_id, so rows referencing a removed account simply stay put.
//   * Real accounts (dangvohoangvan@gmail.com, trucqueen2003@gmail.com) and all
//     real orders / addresses / order_items are never in the target set.
//   * Baseline drift ABORTS by design (e.g. 59 candidates instead of 54):
//     re-review the data and update EXPECTED below before cleaning again.
//
// Usage
//   node scripts/cleanup-rbac-stale.mjs             # dry run (default)
//   node scripts/cleanup-rbac-stale.mjs --execute   # perform the deletions
// ===========================================================================
import fs from "node:fs";

const EXECUTE = process.argv.includes("--execute");

const CANDIDATE_PREFIX = "rbac-verify-";
const PAGE_SIZE = 1000;

// Frozen baseline. The gates compare live data against these and ABORT on drift.
// EXPECTED.orders is the ORIGINAL known stale set (2 rows). The script is
// resumable: an EXPECTED order that is already absent is classified as
// "already cleaned" after proving no row with that id exists anywhere; only
// orders still present are pending cleanup. The set itself is never shrunk to
// hide partial progress.
const EXPECTED = {
  candidates: 54,
  profiles: 2,
  orders: 2,
  staleAddresses: 0,
  staleOrderItems: 0,
  realAccounts: 2,
  realOrdersBaseline: 7,
  realOrderItemsBaseline: 19,
  realAddressesBaseline: 2,
  realEmails: ["dangvohoangvan@gmail.com", "trucqueen2003@gmail.com"],
  profileIds: [
    "c6b2d692-3f38-40bc-a97f-657ed1115d11",
    "e6010082-8e7a-4abc-bd05-2474839dd996",
  ],
  orders: [
    {
      id: "e5e330e5-11a6-47e0-b4ba-84fae3e39634",
      number: "RBAC-MUD1I8IX-S",
      ownerId: "c6b2d692-3f38-40bc-a97f-657ed1115d11",
    },
    {
      id: "80287f63-21b7-4f8b-b28b-8b42e490edc1",
      number: "RBAC-MUFRHQIN-S2",
      ownerId: "e6010082-8e7a-4abc-bd05-2474839dd996",
    },
  ],
};

function loadEnv() {
  const raw = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const get = (k) => (raw.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim();
  const env = {
    url: get("NEXT_PUBLIC_SUPABASE_URL"),
    svc: get("SUPABASE_SECRET_KEY"),
  };
  if (!env.url || !env.svc) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY in .env.local");
  }
  return env;
}

const ENV = loadEnv();

// --- request helpers -------------------------------------------------------
// rest(): PostgREST. Defaults to GET; a mutating method is only ever passed by
// the gated --execute block, and only with ids the gates validated.
async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${ENV.url}/rest/v1${path}`, {
    method,
    headers: {
      apikey: ENV.svc,
      Authorization: `Bearer ${ENV.svc}`,
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
  return { status: res.status, json };
}

// auth(): GoTrue admin API. GET only unless --execute removes a validated
// candidate identity.
async function auth(path, { method = "GET" } = {}) {
  const res = await fetch(`${ENV.url}/auth/v1${path}`, {
    method,
    headers: {
      apikey: ENV.svc,
      Authorization: `Bearer ${ENV.svc}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

// Fail-closed abort. Before any deletion it prints "NO DATA WAS DELETED";
// once deletions have begun it reports the cleanup as incomplete instead.
function abort(message, { afterDeletion = false } = {}) {
  console.log(`\n${afterDeletion ? "CLEANUP INCOMPLETE" : "ABORT"} — ${message}`);
  if (!afterDeletion) console.log("NO DATA WAS DELETED.");
  process.exit(1);
}

// Every read that feeds a gate is truncation-guarded: if a query comes back
// with a full page we stop rather than judge safety on a partial inventory.
const MAX_ROWS = 5000;
const MAX_AUTH_PAGES = 10;

function assertComplete(rows, limit, source) {
  if (rows.length >= limit) {
    abort(`read of ${source} returned the full page size (${limit}) — the inventory may be truncated; refusing to continue.`);
  }
  return rows;
}

async function selectAll(table, columns) {
  const res = await rest(`/${table}?select=${columns}&limit=${MAX_ROWS}`);
  if (res.status !== 200) {
    abort(`GET ${table} failed: HTTP ${res.status} ${JSON.stringify(res.json)?.slice(0, 200)}`);
  }
  return assertComplete(res.json ?? [], MAX_ROWS, table);
}

// Scoped read: filtering by an explicit id set is what makes stale-data
// detection exhaustive — it never depends on unrelated rows fitting in a page.
const idIn = (ids) => `in.(${ids.join(",")})`;

async function scoped(table, columns, filter, source) {
  const res = await rest(`/${table}?select=${columns}&${filter}&limit=${MAX_ROWS}`);
  if (res.status !== 200) {
    abort(`GET ${table}?${filter} failed: HTTP ${res.status} ${JSON.stringify(res.json)?.slice(0, 200)}`);
  }
  return assertComplete(res.json ?? [], MAX_ROWS, source ?? `${table}?${filter}`);
}

async function listAuthUsers() {
  const all = [];
  for (let page = 1; page <= MAX_AUTH_PAGES; page += 1) {
    const res = await auth(`/admin/users?per_page=${PAGE_SIZE}&page=${page}`);
    if (res.status !== 200) {
      abort(`GET /admin/users failed: HTTP ${res.status} ${JSON.stringify(res.json)?.slice(0, 200)}`);
    }
    const batch = res.json?.users ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;
    if (page === MAX_AUTH_PAGES) {
      abort(
        `Auth pagination may be incomplete: page ${page} (the last allowed page) returned a full page of ` +
          `${PAGE_SIZE} accounts, so more may exist beyond the ${MAX_AUTH_PAGES * PAGE_SIZE} seen. ` +
          "Refusing to continue with a partial Auth inventory."
      );
    }
  }
  return all;
}

// --- gate bookkeeping ------------------------------------------------------
const failures = [];
function gate(label, ok, detail = "") {
  if (!ok) failures.push(`${label}${detail ? " — " + detail : ""}`);
}

console.log(`Solenne stale RBAC cleanup — ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
console.log(`Target: ${ENV.url}\n`);

// --- read-only data load ---------------------------------------------------
// User-owned data is queried BY ID SET rather than fetched wholesale, so stale
// detection cannot be defeated by a row sitting beyond a page limit.
const users = await listAuthUsers();
const roles = await selectAll("roles", "id,name");

const isCandidate = (u) => (u.email ?? "").toLowerCase().startsWith(CANDIDATE_PREFIX);

const candidates = users.filter(isCandidate);
const realUsers = users.filter((u) => !isCandidate(u));
const candidateIdList = candidates.map((u) => u.id);
const realIdList = realUsers.map((u) => u.id);
const candidateIds = new Set(candidateIdList);
const realIds = new Set(realIdList);

const roleName = new Map(roles.map((r) => [r.id, r.name]));

// Candidate-owned rows: must be exactly the pinned profiles/orders, and zero
// addresses/order_items (each read is scoped, hence exhaustive).
const candidateProfiles = candidateIdList.length
  ? await scoped("profiles", "id,full_name,status,role_id", `id=${idIn(candidateIdList)}`, "candidate profiles")
  : [];
const candidateOrders = candidateIdList.length
  ? await scoped("orders", "id,order_number,user_id,status,total", `user_id=${idIn(candidateIdList)}`, "candidate orders")
  : [];
const candidateOrderIdList = candidateOrders.map((o) => o.id);
const staleAddresses = candidateIdList.length
  ? await scoped("addresses", "id,user_id", `user_id=${idIn(candidateIdList)}`, "candidate addresses")
  : [];
const staleOrderItems = candidateOrderIdList.length
  ? await scoped("order_items", "id,order_id", `order_id=${idIn(candidateOrderIdList)}`, "candidate order_items")
  : [];

// Pinned rows are read by id, so a pinned profile/order that somehow belongs to
// a REAL account still shows up and fails the ownership gates below.
const pinnedProfiles = await scoped(
  "profiles",
  "id,full_name,status,role_id",
  `id=${idIn(EXPECTED.profileIds)}`,
  "pinned stale profiles"
);
const pinnedOrderIdList = EXPECTED.orders.map((o) => o.id);
const pinnedOrders = await scoped(
  "orders",
  "id,order_number,user_id,status,total",
  `id=${idIn(pinnedOrderIdList)}`,
  "pinned stale orders"
);

// Real data snapshot — captured now, re-verified after deletion (and never
// included in the deletion plan).
const realProfiles = realIdList.length
  ? await scoped("profiles", "id,role_id,status", `id=${idIn(realIdList)}`, "real profiles")
  : [];
const realOrders = realIdList.length
  ? await scoped("orders", "id,order_number,user_id", `user_id=${idIn(realIdList)}`, "real orders")
  : [];
const realOrderIdList = realOrders.map((o) => o.id);
const realOrderItems = realOrderIdList.length
  ? await scoped("order_items", "id,order_id", `order_id=${idIn(realOrderIdList)}`, "real order_items")
  : [];
const realAddresses = realIdList.length
  ? await scoped("addresses", "id,user_id", `user_id=${idIn(realIdList)}`, "real addresses")
  : [];
const realSnapshot = {
  accounts: realUsers.length,
  profiles: realProfiles.length,
  orders: realOrders.length,
  orderItems: realOrderItems.length,
  addresses: realAddresses.length,
};

// audit_logs is informational only: it is never part of the plan, so a failure
// to read it must not block the cleanup.
let auditRows = [];
let auditReadError = null;
try {
  const auditRes = await rest(`/audit_logs?select=id,actor_id&limit=${MAX_ROWS}`);
  if (auditRes.status !== 200) {
    throw new Error(`HTTP ${auditRes.status} ${JSON.stringify(auditRes.json)?.slice(0, 200)}`);
  }
  auditRows = auditRes.json ?? [];
  if (auditRows.length >= MAX_ROWS) {
    auditReadError = `truncated at ${MAX_ROWS} rows (informational only)`;
  }
} catch (error) {
  auditReadError = error instanceof Error ? error.message : String(error);
}
const auditRefsStale = auditRows.filter((a) => candidateIds.has(a.actor_id));

// --- gate 1: the candidate set is exactly the expected one -----------------
gate(`auth user candidate count is exactly ${EXPECTED.candidates}`, candidates.length === EXPECTED.candidates, `observed ${candidates.length}`);
gate(`every candidate email starts with "${CANDIDATE_PREFIX}"`, candidates.every((u) => isCandidate(u)));
gate(
  "no NON-candidate account carries a 'verify' email",
  users.filter((u) => !isCandidate(u) && /verify/i.test(u.email ?? "")).length === 0
);

// --- gate 2: real accounts are protected ----------------------------------
for (const email of EXPECTED.realEmails) {
  const u = users.find((x) => (x.email ?? "").toLowerCase() === email);
  gate(`real account exists and is NOT a candidate: ${email}`, Boolean(u) && !candidateIds.has(u.id), u ? `id=${u.id}` : "not found");
}
gate(`non-candidate (real) account count is exactly ${EXPECTED.realAccounts}`, realUsers.length === EXPECTED.realAccounts, `observed ${realUsers.length}`);
gate("no real account id appears in the candidate set", [...candidateIds].every((id) => !realIds.has(id)));

// --- gate 3: the only allowed profiles -------------------------------------
gate(`candidate-owned profiles count is exactly ${EXPECTED.profiles}`, candidateProfiles.length === EXPECTED.profiles, `observed ${candidateProfiles.length}`);
for (const pid of EXPECTED.profileIds) {
  const p = pinnedProfiles.find((x) => x.id === pid);
  const owner = users.find((u) => u.id === pid);
  gate(`expected stale profile exists: ${pid}`, Boolean(p));
  gate(`profile ${pid} belongs to a candidate auth user`, Boolean(p) && candidateIds.has(p.id));
  gate(`profile ${pid} owner email starts with "${CANDIDATE_PREFIX}"`, Boolean(owner) && isCandidate(owner));
  gate(`profile ${pid} role is staff`, Boolean(p) && roleName.get(p.role_id) === "staff", p ? `role=${roleName.get(p.role_id) ?? p.role_id}` : "");
  gate(`profile ${pid} status is active`, Boolean(p) && p.status === "active", p ? `status=${p.status}` : "");
}
gate("no unexpected candidate owns a profile", candidateProfiles.every((p) => EXPECTED.profileIds.includes(p.id)));

// --- gate 4: only the ORIGINAL known orders, resumably ----------------------
// Partition the ORIGINAL known set into pending (still present) vs already
// cleaned (absent everywhere after the interrupted run). An absent EXPECTED
// order is classified as already cleaned — never recreated, never a failure.
// Only orders still present are pending cleanup.
const pendingOrderWants = EXPECTED.orders.filter((w) => pinnedOrders.some((x) => x.id === w.id));
const cleanedOrderWants = EXPECTED.orders.filter((w) => !pinnedOrders.some((x) => x.id === w.id));
gate("stale-order partition covers the original known set", pendingOrderWants.length + cleanedOrderWants.length === EXPECTED.orders.length, `pending ${pendingOrderWants.length} + cleaned ${cleanedOrderWants.length} vs original ${EXPECTED.orders.length}`);
gate("candidate-owned orders match the pending set", candidateOrders.length === pendingOrderWants.length && candidateOrders.every((o) => pendingOrderWants.some((w) => w.id === o.id)), `observed ${candidateOrders.length} vs pending ${pendingOrderWants.length}`);
for (const want of cleanedOrderWants) {
  gate(`expected stale order already cleaned (absent everywhere): ${want.number} (${want.id})`, !candidateOrders.some((x) => x.id === want.id) && !staleOrderItems.some((i) => i.order_id === want.id), "must be absent from candidate orders and order_items");
}
for (const want of pendingOrderWants) {
  const o = pinnedOrders.find((x) => x.id === want.id);
  gate(`order ${want.number} keeps its order_number`, Boolean(o) && o.order_number === want.number, o ? `observed ${o.order_number}` : "");
  gate(`order ${want.number} belongs to expected stale profile ${want.ownerId}`, Boolean(o) && o.user_id === want.ownerId);
  gate(`order ${want.number} is owned by a candidate, not a real account`, Boolean(o) && candidateIds.has(o.user_id) && !realIds.has(o.user_id));
  gate(`order ${want.number} status is pending`, Boolean(o) && o.status === "pending", o ? `status=${o.status}` : "");
  gate(`order ${want.number} total is 1`, Boolean(o) && Number(o.total) === 1, o ? `total=${o.total}` : "");
  gate(`order ${want.number} has zero order_items`, !staleOrderItems.some((i) => i.order_id === want.id));
}
gate("no unexpected candidate owns an order", candidateOrders.every((o) => EXPECTED.orders.some((w) => w.id === o.id)));

// --- gate 5: addresses / order_items must all be real data -----------------
// Both are read scoped to an id set, so a stale row cannot hide behind a row
// limit: the candidate-scoped reads must come back empty, and every real row
// must belong to a real account/order.
gate(`stale addresses (candidate-owned) count is ${EXPECTED.staleAddresses}`, staleAddresses.length === EXPECTED.staleAddresses, `observed ${staleAddresses.length}${staleAddresses.length ? ": " + staleAddresses.map((a) => a.id).join(", ") : ""}`);
gate(`stale order_items (candidate-owned) count is ${EXPECTED.staleOrderItems}`, staleOrderItems.length === EXPECTED.staleOrderItems, `observed ${staleOrderItems.length}${staleOrderItems.length ? ": " + staleOrderItems.map((i) => i.id).join(", ") : ""}`);
gate("every real address belongs to a real (non-candidate) account", realAddresses.every((a) => realIds.has(a.user_id) && !candidateIds.has(a.user_id)));
gate("every real order_item belongs to a real (non-candidate) order", realOrderItems.every((i) => realOrderIdList.includes(i.order_id)));

// --- dry-run / gate report -------------------------------------------------
const ok = (condition) => (condition ? "PASS" : "FAIL");

console.log("Auth users:");
console.log(`  candidates: ${candidates.length}`);
console.log(`  expected:   ${EXPECTED.candidates}`);
console.log(`  status:     ${ok(candidates.length === EXPECTED.candidates)}\n`);

console.log("Profiles:");
console.log(`  candidates: ${candidateProfiles.length}`);
console.log(`  expected:   ${EXPECTED.profiles}`);
console.log(`  status:     ${ok(candidateProfiles.length === EXPECTED.profiles)}\n`);

console.log("Orders:");
console.log(`  original known stale: ${EXPECTED.orders.length}`);
console.log(`  already cleaned:      ${cleanedOrderWants.length}${cleanedOrderWants.length ? ` (${cleanedOrderWants.map((w) => w.number).join(", ")})` : ""}`);
console.log(`  remaining:            ${pendingOrderWants.length}${pendingOrderWants.length ? ` (${pendingOrderWants.map((w) => w.number).join(", ")})` : ""}`);
console.log(`  candidates: ${candidateOrders.length}`);
console.log(`  status:     ${ok(candidateOrders.length === pendingOrderWants.length)}\n`);

console.log("Addresses:");
console.log(`  stale: ${staleAddresses.length}`);
console.log(`  status: ${ok(staleAddresses.length === EXPECTED.staleAddresses)}\n`);

console.log("Order items:");
console.log(`  stale: ${staleOrderItems.length}`);
console.log(`  status: ${ok(staleOrderItems.length === EXPECTED.staleOrderItems)}\n`);

console.log("Real accounts protected:");
console.log(`  ${realUsers.length} — ${realUsers.map((u) => u.email).join(", ")}`);
console.log(`  status: ${ok(realUsers.length === EXPECTED.realAccounts && realUsers.every((u) => !candidateIds.has(u.id)))}\n`);

console.log("Audit logs:");
console.log("  untouched");
console.log(`  status: ${ok(auditReadError === null)}`);
if (auditReadError) {
  console.log(`  (read failed: ${auditReadError} — audit_logs is not part of the plan)`);
} else {
  console.log(`  (${auditRows.length} rows read; ${auditRefsStale.length} reference stale actor_ids and are preserved)`);
}
console.log();

console.log("Real data excluded from the plan (read by id set, never by a page limit):");
console.log(`  accounts:    ${realSnapshot.accounts}`);
console.log(`  profiles:    ${realSnapshot.profiles}`);
console.log(`  orders:      ${realSnapshot.orders}${realSnapshot.orders === EXPECTED.realOrdersBaseline ? "" : ` (baseline was ${EXPECTED.realOrdersBaseline})`}`);
console.log(`  order_items: ${realSnapshot.orderItems}${realSnapshot.orderItems === EXPECTED.realOrderItemsBaseline ? "" : ` (baseline was ${EXPECTED.realOrderItemsBaseline})`}`);
console.log(`  addresses:   ${realSnapshot.addresses}${realSnapshot.addresses === EXPECTED.realAddressesBaseline ? "" : ` (baseline was ${EXPECTED.realAddressesBaseline})`}`);
console.log();

if (failures.length > 0) {
  console.log("Safety gates failed:");
  for (const failure of failures) console.log(`  - ${failure}`);
  abort(`${failures.length} safety gate(s) failed; see above.`);
}

// --- plan (exact ids that would be affected) -------------------------------
console.log("Cleanup plan (dependency order):");
console.log(`  1. order_items: ${staleOrderItems.length} rows (none expected)`);
console.log(`  2. orders:      ${candidateOrders.length} rows`);
for (const o of candidateOrders) console.log(`       ${o.id} | ${o.order_number} | owner ${o.user_id}`);
console.log(`  3. addresses:   ${staleAddresses.length} rows (none expected)`);
console.log(`  4. profiles:    ${candidateProfiles.length} rows`);
for (const p of candidateProfiles) console.log(`       ${p.id} | role=${roleName.get(p.role_id)} | status=${p.status}`);
console.log(`  5. auth users:  ${candidates.length} rows`);
for (const u of [...candidates].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
  console.log(`       ${u.id} | ${u.email}`);
}
console.log("  audit_logs:     NOT INCLUDED — append-only trail, never modified");
console.log();

if (!EXECUTE) {
  console.log("DRY RUN COMPLETE");
  console.log("NO DATA WAS DELETED");
  process.exit(0);
}

// --- execution (gated: reachable only with --execute AND all gates green) ---
console.log("--execute passed and every gate is green. Removing the validated rows...\n");

// A DELETE is accepted only when the database RETURNS the exact row it removed.
// `Prefer: return=representation` makes that possible — a bare 204 is never
// accepted as proof, because PostgREST also answers 204 when ZERO rows matched.
function expectRepresentation(label, res, expectedId, expectedFields = {}) {
  const rows = Array.isArray(res.json) ? res.json : [];
  const row = rows.find((entry) => entry?.id === expectedId);
  const fieldsMatch =
    row && Object.entries(expectedFields).every(([key, value]) => row[key] === value);

  if (res.status !== 200 || !row || !fieldsMatch) {
    abort(
      `${label} (${expectedId}) was NOT verifiably deleted: HTTP ${res.status} ` +
        `${JSON.stringify(res.json)?.slice(0, 300)}`,
      { afterDeletion: true }
    );
  }
  return row;
}

for (const o of candidateOrders) {
  const res = await rest(`/orders?id=eq.${o.id}`, { method: "DELETE", prefer: "return=representation" });
  const row = expectRepresentation("order", res, o.id, { order_number: o.order_number });
  console.log(`  order ${o.order_number} (${o.id}) deleted — representation: ${row.order_number} / ${row.status}`);
}

for (const p of candidateProfiles) {
  const res = await rest(`/profiles?id=eq.${p.id}`, { method: "DELETE", prefer: "return=representation" });
  const row = expectRepresentation("profile", res, p.id);
  console.log(`  profile ${p.id} deleted — representation: role_id=${row.role_id} status=${row.status}`);
}

let identitiesRemoved = 0;
for (const u of candidates) {
  const res = await auth(`/admin/users/${u.id}`, { method: "DELETE" });
  if (res.status >= 300) {
    abort(
      `auth user ${u.email} (${u.id}) could not be deleted: HTTP ${res.status} ` +
        `${JSON.stringify(res.json)?.slice(0, 300)}`,
      { afterDeletion: true }
    );
  }
  identitiesRemoved += 1;
}
console.log(`  ${identitiesRemoved}/${candidates.length} auth users deleted (each answered 2xx)`);

// --- post-delete verification (READ-ONLY) ----------------------------------
console.log("\n--- post-delete verification (read-only) ---");
const verifyFailures = [];
const vGate = (label, ok, detail = "") => {
  if (!ok) verifyFailures.push(`${label}${detail ? " — " + detail : ""}`);
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` (${detail})` : ""}`);
};

const ordersLeft = (await rest(`/orders?select=id,order_number&id=in.(${pinnedOrderIdList.join(",")})`)).json ?? [];
vGate("both stale orders no longer exist", ordersLeft.length === 0, ordersLeft.map((o) => o.order_number).join(", "));

const profilesLeft = (await rest(`/profiles?select=id&id=in.(${EXPECTED.profileIds.join(",")})`)).json ?? [];
vGate("both stale profiles no longer exist", profilesLeft.length === 0, profilesLeft.map((p) => p.id).join(", "));

const usersAfter = await listAuthUsers();
const idsAfter = new Set(usersAfter.map((u) => u.id));
const staleIdsLeft = candidates.filter((u) => idsAfter.has(u.id));
vGate("all stale identities no longer exist", staleIdsLeft.length === 0, staleIdsLeft.map((u) => u.id).join(", "));

const verifyAccountsLeft = usersAfter.filter(isCandidate);
vGate("no rbac-verify-* account remains", verifyAccountsLeft.length === 0, verifyAccountsLeft.map((u) => u.email).join(", "));

for (const email of EXPECTED.realEmails) {
  const stillThere = usersAfter.find((u) => (u.email ?? "").toLowerCase() === email);
  vGate(`real account still exists: ${email}`, Boolean(stillThere), stillThere ? `id=${stillThere.id}` : "MISSING");
}

// Real data must survive untouched; the snapshot was captured before deletion.
const realProfilesAfter = realIdList.length
  ? await scoped("profiles", "id", `id=${idIn(realIdList)}`, "real profiles (verify)")
  : [];
vGate(
  "both real accounts' profiles still exist",
  realProfilesAfter.length === realSnapshot.profiles && realSnapshot.profiles === 2,
  `observed ${realProfilesAfter.length} (baseline ${realSnapshot.profiles})`
);

const realOrdersAfter = realIdList.length
  ? await scoped("orders", "id", `user_id=${idIn(realIdList)}`, "real orders (verify)")
  : [];
const realOrderIdListAfter = realOrdersAfter.map((o) => o.id);
vGate(
  "real order count remains 7",
  realOrdersAfter.length === EXPECTED.realOrdersBaseline,
  `observed ${realOrdersAfter.length} (baseline ${EXPECTED.realOrdersBaseline})`
);

const realOrderItemsAfter = realOrderIdListAfter.length
  ? await scoped(
      "order_items",
      "id",
      `order_id=${idIn(realOrderIdListAfter)}`,
      "real order_items (verify)"
    )
  : [];
vGate(
  "real order_item count remains 19",
  realOrderItemsAfter.length === EXPECTED.realOrderItemsBaseline,
  `observed ${realOrderItemsAfter.length} (baseline ${EXPECTED.realOrderItemsBaseline})`
);

const realAddressesAfter = realIdList.length
  ? await scoped("addresses", "id", `user_id=${idIn(realIdList)}`, "real addresses (verify)")
  : [];
vGate(
  "real address count remains 2",
  realAddressesAfter.length === EXPECTED.realAddressesBaseline,
  `observed ${realAddressesAfter.length} (baseline ${EXPECTED.realAddressesBaseline})`
);

let auditAfterCount = null;
let auditAfterError = null;
try {
  const auditAfterRes = await rest(`/audit_logs?select=id&limit=${MAX_ROWS}`);
  if (auditAfterRes.status !== 200) {
    throw new Error(`HTTP ${auditAfterRes.status}`);
  }
  auditAfterCount = (auditAfterRes.json ?? []).length;
} catch (error) {
  auditAfterError = error instanceof Error ? error.message : String(error);
}
const auditBeforeCount = auditReadError === null ? auditRows.length : null;
vGate(
  "audit_logs count unchanged (never deleted)",
  auditAfterError === null &&
    auditBeforeCount !== null &&
    auditAfterCount === auditBeforeCount,
  auditAfterError !== null
    ? `read failed: ${auditAfterError}`
    : `before=${auditBeforeCount} after=${auditAfterCount}`
);

if (verifyFailures.length > 0) {
  console.log("\nCLEANUP INCOMPLETE — post-delete verification failed:");
  for (const failure of verifyFailures) console.log(`  - ${failure}`);
  process.exit(1);
}

console.log("\nCLEANUP COMPLETE — every post-delete verification passed.");
process.exit(0);


