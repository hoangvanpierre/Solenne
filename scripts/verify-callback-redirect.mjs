#!/usr/bin/env node
// ===========================================================================
// Solenne auth-callback redirect verification
// ===========================================================================
// Focused, read-only checks for the S-2 follow-up in
// `app/auth/callback/route.ts`.
//
// The route cannot be imported here (it needs the Next request runtime and a
// live Supabase session), so this harness asserts three things instead:
//
//   1. Wiring   — the route applies the shared sanitizer to its user-controlled
//                 `next` parameter, never reads that parameter raw again, and
//                 only honours `x-forwarded-host` when the header names the
//                 very host the request arrived on.
//   2. Policy   — `sanitizeNextPath()` preserves valid relative paths and falls
//                 back to /account for hostile, malformed or empty input.
//   3. Target   — whatever the input, the string handed to
//                 `NextResponse.redirect()` stays on the request's origin and
//                 never throws. NextResponse.redirect() emits
//                 `String(new URL(target))` and throws a 500 on a malformed
//                 target, so both properties are modelled exactly here, and a
//                 control check proves the unsanitized composition really was
//                 exploitable (so these checks cannot pass vacuously).
//
// No network, no database, no writes, no Supabase credentials required.
//
// Usage:
//   node scripts/verify-callback-redirect.mjs
//
// Requires Node >= 22.18 (TypeScript type stripping is on by default) because
// the real helper is imported rather than reimplemented. Node may print a
// MODULE_TYPELESS_PACKAGE_JSON warning for that import; it is harmless.
// ===========================================================================
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { sanitizeNextPath } from "../lib/redirect.ts";

const ROUTE_URL = new URL("../app/auth/callback/route.ts", import.meta.url);
const ORIGIN = "https://solenne.example"; // stands in for new URL(request.url).origin
const FALLBACK = "/account";

const results = [];
function record(section, name, ok, actual) {
  results.push({ section, name, ok, actual });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : `  -> ${actual}`}`);
}

// -- 1. Route wiring --------------------------------------------------------
console.log("== Route wiring (app/auth/callback/route.ts) ==");
const src = fs.readFileSync(fileURLToPath(ROUTE_URL), "utf8");
const rawNextReads = src.match(/searchParams\.get\("next"\)/g) ?? [];

record(
  "wiring",
  "imports the shared sanitizeNextPath helper",
  /import\s*\{[^}]*\bsanitizeNextPath\b[^}]*\}\s*from\s*"@\/lib\/redirect"/.test(src),
  "sanitizeNextPath import not found",
);
record(
  "wiring",
  "sanitizes `next` at the point where it is read",
  /const next = sanitizeNextPath\(searchParams\.get\("next"\)\)/.test(src),
  "sanitized assignment not found",
);
record(
  "wiring",
  "reads the raw `next` query value exactly once",
  rawNextReads.length === 1,
  `${rawNextReads.length} raw reads`,
);
record(
  "wiring",
  'no raw `?? "/account"` default bypasses the sanitizer',
  !/searchParams\.get\("next"\)\s*\?\?/.test(src),
  "raw fallback still present",
);
record(
  "wiring",
  "x-forwarded-host is compared with the request's own host",
  /forwardedHost\.toLowerCase\(\) === requestHost\.toLowerCase\(\)/.test(src),
  "forwarded host is not validated",
);
record(
  "wiring",
  "x-forwarded-host is never interpolated unvalidated",
  !/https:\/\/\$\{forwardedHost\}/.test(src),
  "raw forwarded host interpolated into the target",
);

// -- 2. Sanitizer policy ----------------------------------------------------
console.log("\n== Policy: valid relative paths are preserved ==");
const preserved = [
  "/account",
  "/account/orders",
  "/checkout",
  "/checkout/success?number=SLN-MU1HQU7C-SMOY",
  "/reset-password",
  "/products?sort=newest",
  "/account?message=password_updated",
  "/account#top",
];
for (const value of preserved) {
  const actual = sanitizeNextPath(value);
  record("policy", `preserved ${JSON.stringify(value)}`, actual === value, `got ${JSON.stringify(actual)}`);
}

console.log("\n== Policy: unsafe, malformed or empty input falls back ==");
const rejected = [
  "https://evil.example",
  "http://evil.example",
  "//evil.example",
  "///evil.example",
  ".evil.example",
  "@evil.example",
  ":8080",
  "account",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "https:/evil.example",
  "/\\evil.example",
  "\\\\evil.example",
  "/account\r\nLocation: https://evil.example",
  "/account\n",
  "/account\u0000",
  "",
];
for (const value of rejected) {
  const actual = sanitizeNextPath(value);
  record("policy", `fallback ${JSON.stringify(value)}`, actual === FALLBACK, `got ${JSON.stringify(actual)}`);
}

console.log("\n== Policy: whitespace is normalised, then re-checked ==");
for (const [value, expected] of [
  ["\t/account", "/account"],
  ["   /account  ", "/account"],
  ["   ", FALLBACK],
]) {
  const actual = sanitizeNextPath(value);
  record("policy", `normalised ${JSON.stringify(value)}`, actual === expected, `got ${JSON.stringify(actual)}`);
}

// -- 3. Composed redirect target -------------------------------------------
// NextResponse.redirect(target) sets Location to String(new URL(target)), and
// throws for a malformed target -> a 500 from this route handler.
console.log("\n== Composed target handed to NextResponse.redirect() ==");
const corpus = [
  ...preserved,
  ...rejected,
  "\t/account",
  "   ",
  "//solenne.example@evil.example",
  "/////evil.example",
  "\\/evil.example",
];

let escapes = 0;
let malformed = 0;
let rawEscapes = 0;
let rawMalformed = 0;
const offenders = [];

for (const input of corpus) {
  const sanitized = sanitizeNextPath(input);

  try {
    if (new URL(`${ORIGIN}${sanitized}`).origin !== ORIGIN) {
      escapes++;
      offenders.push(`${JSON.stringify(input)} -> ${sanitized}`);
    }
  } catch {
    malformed++;
    offenders.push(`${JSON.stringify(input)} -> THROWS`);
  }

  // Control: the same composition WITHOUT the sanitizer must really escape or
  // throw for this corpus, otherwise the two checks above prove nothing.
  try {
    if (new URL(`${ORIGIN}${input}`).origin !== ORIGIN) rawEscapes++;
  } catch {
    rawMalformed++;
  }
}

record(
  "target",
  `all ${corpus.length} inputs stay on the request origin`,
  escapes === 0,
  `${escapes} escaped: ${offenders.slice(0, 3).join(", ")}`,
);
record(
  "target",
  "no input produces a malformed target (would be a 500)",
  malformed === 0,
  `${malformed} malformed`,
);
record(
  "target",
  "control: the unsanitized composition is exploitable without the sanitizer",
  rawEscapes >= 2 && rawMalformed >= 1,
  `raw escapes=${rawEscapes} raw malformed=${rawMalformed}`,
);

// -- 4. x-forwarded-host trust rule ---------------------------------------
// Mirrors the route's production rule; in development the route short-circuits
// to `origin`, and a matching forwarded host is byte-identical to it.
console.log("\n== x-forwarded-host trust rule ==");
function redirectBase(requestOrigin, requestHost, forwardedHost) {
  const trusted =
    forwardedHost && forwardedHost.toLowerCase() === requestHost.toLowerCase()
      ? forwardedHost
      : null;
  return trusted ? `https://${trusted}` : requestOrigin;
}

const hostCases = [
  ["matching host is honoured", "solenne.example", "solenne.example"],
  ["uppercase match is honoured", "solenne.example", "SOLENNE.EXAMPLE"],
  ["foreign host is ignored", "solenne.example", "evil.example"],
  ["host:port mismatch is ignored", "solenne.example", "solenne.example:8443"],
  ["comma-separated list is ignored", "solenne.example", "solenne.example, evil.example"],
  ["empty-ish header is ignored", "solenne.example", "  "],
  ["missing header falls back to origin", "solenne.example", null],
];

for (const [name, requestHost, forwardedHost] of hostCases) {
  const base = redirectBase(ORIGIN, requestHost, forwardedHost);
  const ok =
    new URL(`${base}/account`).origin === ORIGIN &&
    new URL(`${base}${sanitizeNextPath("@evil.example")}`).origin === ORIGIN;
  record("forwarded-host", name, ok, `base=${base}`);
}

// -- Summary ---------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
const bySection = results.reduce((acc, r) => {
  acc[r.section] = (acc[r.section] ?? 0) + (r.ok ? 1 : 0);
  return acc;
}, {});

console.log("\n== Summary ==");
for (const [section, count] of Object.entries(bySection)) {
  console.log(`  ${section.padEnd(15)} ${count} passed`);
}
console.log(`  ${results.length - failed.length}/${results.length} checks passed`);

if (failed.length > 0) {
  console.log("\nFailed checks:");
  for (const f of failed) console.log(`  - [${f.section}] ${f.name} -> ${f.actual}`);
  process.exitCode = 1;
}
