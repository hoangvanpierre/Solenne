#!/usr/bin/env node
// ===========================================================================
// Solenne - deterministic verification runner
// ===========================================================================
// Runs the static verification harnesses that are safe in a clean environment:
// no production credentials, no database writes, no browser, no network when
// `.env.local` is absent.
//
// Deliberately NOT included:
//   * verify-rbac.mjs         - requires .env.local + the live Supabase project.
//                               `--full` also creates and deletes test users.
//   * verify-dock-layout.mjs  - requires Puppeteer and a running dev server.
//
// The two order/inventory harnesses below keep their live-database probes
// behind an `.env.local` check: in CI (no env file) they print an [INFO] line
// and run their static assertions only. They never write.
//
// Usage:
//   node scripts/run-verify.mjs
//   pnpm test:verify

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Approved for the default CI gate. Order is stable for readable CI logs. */
const HARNESSES = [
  ["verify-admin-assistant.mjs", "assistant permissions, schemas, prompt budget"],
  ["verify-admin-shell.mjs", "admin shell wiring, focus rules, access guards"],
  ["verify-callback-redirect.mjs", "OAuth callback redirect policy"],
  ["verify-cancel-order.mjs", "atomic order cancellation contract"],
  ["verify-contact-newsletter.mjs", "contact/newsletter persistence contract"],
  ["verify-customer-status.mjs", "customer status + reinstatement contract"],
  ["verify-fulfillment-transitions.mjs", "order status transition contract"],
  ["verify-inventory-adjustment.mjs", "inventory adjustment contract"],
  ["verify-post-login-routing.mjs", "post-login destination policy"],
  ["verify-product-management.mjs", "product/variant management contract"],
  ["verify-reviews.mjs", "verified reviews: eligibility, RLS, moderation contract"],
  ["verify-search.mjs", "search normalization and ranking"],
  ["verify-wishlist.mjs", "wishlist ownership, RLS and UI contract"],
];

const results = [];

for (const [file, description] of HARNESSES) {
  const label = file.replace(/\.mjs$/, "");
  console.log(`\n\u25B6 ${label} - ${description}`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [path.join(here, file)], {
    stdio: "inherit",
  });
  const durationMs = Date.now() - started;

  results.push({
    label,
    durationMs,
    status: result.error ? "error" : result.status === 0 ? "pass" : "fail",
    code: result.error ? result.error.message : String(result.status),
  });
}

const failed = results.filter((result) => result.status !== "pass");

console.log("\n== Verification runner summary ==");
for (const result of results) {
  const mark = result.status === "pass" ? "PASS" : "FAIL";
  console.log(
    `[${mark}] ${result.label.padEnd(32)} ${result.durationMs}ms` +
      (result.status === "pass" ? "" : ` (exit ${result.code})`)
  );
}
console.log(
  `${results.length - failed.length}/${results.length} harnesses passed.`
);

if (failed.length > 0) {
  console.error(
    `\nFailing harness(es): ${failed.map((result) => result.label).join(", ")}`
  );
  process.exit(1);
}
