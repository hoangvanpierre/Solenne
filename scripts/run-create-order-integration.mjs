#!/usr/bin/env node
// ===========================================================================
// Solenne — disposable-database integration runner for 0016 create_order
// ===========================================================================
// Runs the full order-creation contract against a DISPOSABLE PostgreSQL:
//   * fixture + migrations 0001/0002/0003/0005/0006/0007/0008/0016
//   * the sequential SQL suite in supabase/tests/0016_create_order.tests.sql
//   * real two-session concurrency scenarios (last unit + idempotent retry)
//
// Requirements:
//   * a FRESH disposable PostgreSQL database (local or a throwaway container)
//   * psql on PATH, or SOLENNE_TEST_PSQL=/path/to/psql
//   * SOLENNE_TEST_DATABASE_URL=postgresql://...
//
// Safety:
//   * refuses non-local hosts unless SOLENNE_TEST_DB_ALLOW_REMOTE=1
//   * the fixture refuses to seed a database whose public.orders has rows
//   * NEVER point this at production
//
// Usage:
//   SOLENNE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/solenne_test \
//     node scripts/run-create-order-integration.mjs
// ===========================================================================
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const dbUrl = process.env.SOLENNE_TEST_DATABASE_URL;
const psql = process.env.SOLENNE_TEST_PSQL || "psql";

function fail(message) {
  console.error(`\n[FAIL] ${message}`);
  process.exit(1);
}

if (!dbUrl) {
  console.error(
    "[SKIP] SOLENNE_TEST_DATABASE_URL is not set.\n" +
      "       The integration suite only runs against a fresh disposable PostgreSQL.\n" +
      "       Example:\n" +
      "       SOLENNE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/solenne_test \\\n" +
      "         node scripts/run-create-order-integration.mjs"
  );
  process.exit(0);
}

let parsed;
try {
  parsed = new URL(dbUrl);
} catch {
  fail("SOLENNE_TEST_DATABASE_URL is not a valid connection URL.");
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!localHosts.has(parsed.hostname) && process.env.SOLENNE_TEST_DB_ALLOW_REMOTE !== "1") {
  fail(
    `Refusing to run against non-local host "${parsed.hostname}". ` +
      "Set SOLENNE_TEST_DB_ALLOW_REMOTE=1 only for a disposable remote test database."
  );
}

const setupFiles = [
  "supabase/tests/0016_create_order.fixture.sql",
  "supabase/migrations/0001_rbac_schema.sql",
  "supabase/migrations/0002_rbac_seed.sql",
  "supabase/migrations/0003_rbac_rls.sql",
  "supabase/migrations/0005_rbac_security_foundation.sql",
  "supabase/migrations/0006_cancel_order_atomic.sql",
  "supabase/migrations/0007_order_fulfillment_transitions.sql",
  "supabase/migrations/0008_cancel_order_outbox_event.sql",
  "supabase/tests/0016_create_order.seed.sql",
  "supabase/migrations/0016_create_order_atomic.sql",
  "supabase/tests/0017_order_status_events.legacy.sql",
  "supabase/migrations/0017_order_status_events.sql",
  "supabase/tests/0016_create_order.tests.sql",
  "supabase/tests/0017_order_status_events.tests.sql",
];

function runPsql(args) {
  // psql requires options BEFORE the connection URI (it accepts a dbname as a
  // positional argument; anything after it is ignored).
  return spawnSync(psql, ["-v", "ON_ERROR_STOP=1", ...args, dbUrl], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

if (runPsql(["-c", "select 1"]).status !== 0) {
  fail(
    `Could not connect with "${psql}". Install the PostgreSQL client or set SOLENNE_TEST_PSQL.`
  );
}

console.log("== Applying fixture, migrations and sequential integration suite ==");
for (const file of setupFiles) {
  const result = runPsql(["-q", "-f", path.join(repoRoot, file)]);
  if (result.status !== 0) {
    console.error(result.stdout || "");
    console.error(result.stderr || "");
    fail(`Failed while running ${file}`);
  }
  console.log(`  [PASS] ${file}`);
}

// ---------------------------------------------------------------------------
// Two-session concurrency scenarios
// ---------------------------------------------------------------------------
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "solenne-0016-"));
const CONCURRENCY_VARIANT = "20000000-0000-4000-8000-000000000005";
const CONCURRENCY_PRODUCT = "10000000-0000-4000-8000-000000000005";
const CUSTOMER_A = "a1111111-1111-4111-8111-111111111111";
const CUSTOMER_B = "b2222222-2222-4222-8222-222222222222";
const LOCK_KEY = 427001;

const fixture = runPsql([
  "-q",
  "-c",
  `
    insert into public.products (id, slug, name, base_price, is_active)
    values ('${CONCURRENCY_PRODUCT}', 'concurrency-candle', 'Concurrency Candle', 20.00, true)
    on conflict (id) do nothing;

    insert into public.product_variants
      (id, product_id, name, size, sku, price, stock_quantity)
    values ('${CONCURRENCY_VARIANT}', '${CONCURRENCY_PRODUCT}', '100g', '100g', 'CC-100', 20.00, 1)
    on conflict (id) do nothing;

    update public.product_variants
    set stock_quantity = 1
    where id = '${CONCURRENCY_VARIANT}';

    create table if not exists public.concurrency_results (
      scenario text not null,
      session text not null,
      result jsonb not null,
      created_at timestamptz not null default now(),
      primary key (scenario, session)
    );

    delete from public.concurrency_results
    where scenario in ('last-stock', 'idempotency');
  `,
]);
if (fixture.status !== 0) {
  fail(`Could not create the concurrency fixture: ${fixture.stderr}`);
}

function checkoutCall({ uid, email, variantId, quantity, key, notes = "null" }) {
  return `public.test_checkout(
    '${uid}',
    '${email}',
    public.test_address(),
    jsonb_build_array(jsonb_build_object('variantId', '${variantId}', 'quantity', ${quantity})),
    '${key}',
    ${notes}
  )`;
}

function writeScript(name, body) {
  const file = path.join(tempDir, name);
  fs.writeFileSync(file, body, "utf8");
  return file;
}

function startSession(scriptFile) {
  const child = spawn(
    psql,
    ["-v", "ON_ERROR_STOP=1", "-q", "-f", scriptFile, dbUrl],
    { cwd: repoRoot }
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const done = new Promise((resolve) => {
    child.on("close", (code) => resolve({ code, stderr }));
  });
  return { child, done };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAdvisoryLock(timeoutMs = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const probe = runPsql([
      "-At",
      "-c",
      `select count(*)
         from pg_locks
        where locktype = 'advisory'
          and objid = ${LOCK_KEY}
          and granted
          and database = (select oid from pg_database where datname = current_database())`,
    ]);
    if (probe.status === 0 && probe.stdout.trim() !== "0") return true;
    await sleep(100);
  }
  return false;
}

function queryJson(sql) {
  const result = runPsql(["-At", "-F", "\t", "-c", sql]);
  if (result.status !== 0) {
    fail(`Query failed: ${result.stderr || result.stdout}`);
  }
  // Keep leading tabs: an empty first column is meaningful in a TSV row.
  return result.stdout.trimEnd();
}

async function runScenario({ name, aSql, bSql }) {
  const aFile = writeScript(`${name}-a.sql`, aSql);
  const bFile = writeScript(`${name}-b.sql`, bSql);

  const a = startSession(aFile);
  const locked = await waitForAdvisoryLock();
  if (!locked) {
    a.child.kill();
    await a.done;
    fail(`${name}: session A never acquired the coordination lock`);
  }

  const b = startSession(bFile);
  const [aResult, bResult] = await Promise.all([a.done, b.done]);

  if (aResult.code !== 0) {
    fail(`${name}: session A failed: ${aResult.stderr}`);
  }
  if (bResult.code !== 0) {
    fail(`${name}: session B failed: ${bResult.stderr}`);
  }

  console.log(`  [PASS] ${name}: both sessions completed`);
}

// The advisory lock (taken AFTER create_order returns) makes the race
// deterministic: B only starts once A already holds both the variant row lock
// and the coordination advisory lock.
const aPreamble = (scenario, session, call) => `
  begin;
  insert into public.concurrency_results (scenario, session, result)
  select '${scenario}', '${session}', ${call};
  select pg_advisory_lock(${LOCK_KEY});
  select pg_sleep(3);
  commit;
`;

const bScript = (scenario, session, call) => `
  begin;
  insert into public.concurrency_results (scenario, session, result)
  select '${scenario}', '${session}', ${call};
  commit;
`;

console.log("\n== Concurrency: two buyers, one remaining unit ==");
await runScenario({
  name: "last-stock",
  aSql: aPreamble(
    "last-stock",
    "A",
    checkoutCall({
      uid: CUSTOMER_A,
      email: "customer.a@example.test",
      variantId: CONCURRENCY_VARIANT,
      quantity: 1,
      key: "it-conc-last-a",
    })
  ),
  bSql: bScript(
    "last-stock",
    "B",
    checkoutCall({
      uid: CUSTOMER_B,
      email: "customer.b@example.test",
      variantId: CONCURRENCY_VARIANT,
      quantity: 1,
      key: "it-conc-last-b",
    })
  ),
});

const lastStock = queryJson(`
  select
    (select result->>'error' from public.concurrency_results where scenario='last-stock' and session='A'),
    (select result->>'error' from public.concurrency_results where scenario='last-stock' and session='B'),
    (select stock_quantity::text from public.product_variants where id='${CONCURRENCY_VARIANT}'),
    (select count(*)::text from public.order_items where variant_id='${CONCURRENCY_VARIANT}');
`);
const [lastA, lastB, lastStockQty, lastItems] = lastStock.split("\t");
if (lastA) fail(`last-stock: buyer A failed: ${lastA}`);
if (!lastB.startsWith("INSUFFICIENT_STOCK||")) {
  fail(`last-stock: buyer B was not rejected with INSUFFICIENT_STOCK (${lastB || "success"})`);
}
if (lastStockQty !== "0") fail(`last-stock: stock is ${lastStockQty}, expected 0`);
if (lastItems !== "1") fail(`last-stock: ${lastItems} order items, expected 1`);
console.log("  [PASS] exactly one unit sold; second buyer rejected");

console.log("\n== Concurrency: same idempotency key, two sessions ==");
const beforeStock = Number(
  queryJson(
    `select stock_quantity::text from public.product_variants where id='20000000-0000-4000-8000-000000000001'`
  )
);

await runScenario({
  name: "idempotency",
  aSql: aPreamble(
    "idempotency",
    "A",
    checkoutCall({
      uid: CUSTOMER_A,
      email: "customer.a@example.test",
      variantId: "20000000-0000-4000-8000-000000000001",
      quantity: 1,
      key: "it-conc-idem",
    })
  ),
  bSql: bScript(
    "idempotency",
    "B",
    checkoutCall({
      uid: CUSTOMER_A,
      email: "customer.a@example.test",
      variantId: "20000000-0000-4000-8000-000000000001",
      quantity: 1,
      key: "it-conc-idem",
    })
  ),
});

const idem = queryJson(`
  select
    (select result->>'error' from public.concurrency_results where scenario='idempotency' and session='A'),
    (select result->>'error' from public.concurrency_results where scenario='idempotency' and session='B'),
    (select result->>'order_number' from public.concurrency_results where scenario='idempotency' and session='A'),
    (select result->>'order_number' from public.concurrency_results where scenario='idempotency' and session='B'),
    (select result->>'replayed' from public.concurrency_results where scenario='idempotency' and session='B'),
    (select count(*)::text from public.orders where checkout_idempotency_key='it-conc-idem'),
    (select stock_quantity::text from public.product_variants where id='20000000-0000-4000-8000-000000000001');
`);
const [idemA, idemB, orderA, orderB, replayedB, orderCount, afterStock] =
  idem.split("\t");

if (idemA) fail(`idempotency: session A failed: ${idemA}`);
if (idemB) fail(`idempotency: session B failed: ${idemB}`);
if (!orderA || orderA !== orderB) {
  fail(`idempotency: sessions returned different orders (${orderA} vs ${orderB})`);
}
if (replayedB !== "true") fail("idempotency: session B was not marked replayed");
if (orderCount !== "1") fail(`idempotency: ${orderCount} orders exist, expected 1`);
if (Number(afterStock) !== beforeStock - 1) {
  fail(
    `idempotency: stock ${beforeStock} -> ${afterStock}, expected a single deduction`
  );
}
console.log("  [PASS] one order, one stock deduction, second session replayed");

fs.rmSync(tempDir, { recursive: true, force: true });
console.log("\n--- Solenne 0016 + 0017 integration and concurrency suite: ALL CHECKS PASSED ---");
