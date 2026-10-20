#!/usr/bin/env node
// ===========================================================================
// Solenne — Verification Harness for Contact & Newsletter Persistence (0013)
// ===========================================================================
// Statically verifies the contact_messages / newsletter_subscribers surface:
//   A. Migration 0013 exists and declares both relations
//   B. Required columns and NOT NULL / UNIQUE constraints
//   C. Row level security is enabled on both tables
//   D. Least-privilege grants: anon/authenticated revoked, service_role granted
//   E. No public INSERT policy (no anon/authenticated WITH CHECK (true))
//   F. Self-verification block raises on failure
//   G. Legacy schema script is a pointer, not wide-grant DDL
//   H. submitContactAction does NOT report false success on insert failure
//   I. subscribeNewsletterAction does NOT report false success on insert failure
//   J. Duplicate subscription (23505) still maps to a benign success
//   K. Machine-readable `code` discriminants returned by both actions
//   L. Validation failure paths return a `validation` code
//   M. UI components branch on res.success and render localized copy
//   N. en.json and vi.json both expose the required contact/newsletter keys
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

// Normalize CRLF -> LF so line-ending-sensitive assertions are stable across
// Windows and POSIX checkouts.
function readSource(url) {
  return fs.readFileSync(url, "utf8").replace(/\r\n/g, "\n");
}

/**
 * Returns the source text of the block that starts at `startIndex`, matched by
 * balanced braces. Used so "the failed-insert path does not claim success"
 * assertions inspect the real block rather than a character window.
 */
function extractBraceBlock(source, startIndex) {
  const open = source.indexOf("{", startIndex);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return "";
}

console.log("== 1. Migration 0013 (supabase/migrations/0013_contact_newsletter_tables.sql) ==");
const migrationUrl = new URL(
  "../supabase/migrations/0013_contact_newsletter_tables.sql",
  import.meta.url
);
assert("migration 0013 file exists", fs.existsSync(migrationUrl));

const sql = readSource(migrationUrl);

assert(
  "creates public.contact_messages",
  sql.includes("create table if not exists public.contact_messages")
);
assert(
  "creates public.newsletter_subscribers",
  sql.includes("create table if not exists public.newsletter_subscribers")
);

console.log("\n== 2. Schema Shape & Constraints ==");
assert("contact_messages.id is uuid primary key", /contact_messages[\s\S]{0,400}id uuid primary key/i.test(sql));
assert("contact_messages.name NOT NULL", /name text not null/i.test(sql));
assert("contact_messages.email NOT NULL", /email text not null/i.test(sql));
assert("contact_messages.subject allows NULL (optional field)", /subject text/i.test(sql));
assert("contact_messages.message NOT NULL", /message text not null/i.test(sql));
assert(
  "contact_messages.created_at defaults to now()",
  /created_at timestamptz not null default now\(\)/i.test(sql)
);
assert("newsletter_subscribers.email is UNIQUE (drives 23505 branch)", /email text unique not null/i.test(sql));
assert(
  "newsletter_subscribers.subscribed_at defaults to now()",
  /subscribed_at timestamptz not null default now\(\)/i.test(sql)
);

console.log("\n== 3. Row Level Security ==");
assert(
  "RLS enabled on contact_messages",
  sql.includes("alter table public.contact_messages enable row level security;")
);
assert(
  "RLS enabled on newsletter_subscribers",
  sql.includes("alter table public.newsletter_subscribers enable row level security;")
);
console.log("\n== 4. Least-Privilege Grants ==");
assert(
  "revokes anon + authenticated on contact_messages",
  sql.includes("revoke all on table public.contact_messages from anon, authenticated;")
);
assert(
  "revokes anon + authenticated on newsletter_subscribers",
  sql.includes("revoke all on table public.newsletter_subscribers from anon, authenticated;")
);
assert(
  "grants service_role on contact_messages",
  /grant select, insert on public\.contact_messages to service_role;/.test(sql)
);
assert(
  "grants service_role on newsletter_subscribers",
  /grant select, insert on public\.newsletter_subscribers to service_role;/.test(sql)
);

console.log("\n== 5. No Public Write Policies ==");
const policyMatches = sql.match(/create policy/gi) ?? [];
assert("does not create any permissive policy", policyMatches.length === 0, `found ${policyMatches.length}`);
assert("no INSERT ... TO anon, authenticated", !/for\s+insert\s+to\s+anon/i.test(sql));
assert(
  "no WITH CHECK (true) grant surface",
  !/with check\s*\(\s*true\s*\)/i.test(sql)
);

console.log("\n== 6. Self-Verification Block ==");
assert("ships a DO $$ verification block", /do \$\$/.test(sql));
assert(
  "raises when contact table missing",
  /raise exception 'Migration 0013 failed: table public\.contact_messages does not exist'/.test(sql)
);
assert(
  "verifies RLS enabled",
  sql.includes("row level security is not enabled on public.contact_messages")
);
assert(
  "verifies anon lacks INSERT",
  sql.includes("anon unexpectedly holds INSERT on public.contact_messages")
);
assert(
  "verifies service_role holds INSERT",
  sql.includes("service_role lacks INSERT on public.contact_messages")
);
assert("verifies newsletter email uniqueness", sql.includes("not uniquely indexed"));
assert("emits a success notice", /raise notice '--- Solenne 0013 OK:/.test(sql));

console.log("\n== 7. Legacy Schema Script Is A Pointer ==");
const legacyUrl = new URL("../scripts/schema-newsletter-contact.sql", import.meta.url);
assert("scripts/schema-newsletter-contact.sql exists", fs.existsSync(legacyUrl));
const legacy = readSource(legacyUrl);
assert("legacy script is marked SUPERSEDED", legacy.includes("SUPERSEDED"));
assert(
  "legacy script points at migration 0013",
  legacy.includes("supabase/migrations/0013_contact_newsletter_tables.sql")
);
assert(
  "legacy script no longer grants INSERT to anon",
  !/create policy|to anon, authenticated/i.test(legacy)
);
assert("legacy script contains no CREATE TABLE", !/create table/i.test(legacy));

console.log("\n== 8. submitContactAction Never Reports False Success ==");
const contactActionUrl = new URL("../app/actions/contact.ts", import.meta.url);
const contactAction = readSource(contactActionUrl);
assert("exports submitContactAction", contactAction.includes("export async function submitContactAction"));
assert(
  "returns an error branch when the insert fails",
  /if \(error\)[\s\S]{0,600}code: "persist_failed"/.test(contactAction)
);
assert(
  "catch block returns persist_failed (no silent success)",
  /catch \(err\)[\s\S]{0,600}code: "persist_failed"/.test(contactAction)
);
assert("validation failure returns code validation", /code: "validation"/.test(contactAction));
const contactErrBlock = extractBraceBlock(
  contactAction,
  contactAction.indexOf("if (error) {")
);
assert(
  "failed-insert block never returns success: true",
  contactErrBlock.length > 0 && !contactErrBlock.includes("success: true"),
  contactErrBlock.length === 0 ? "if (error) block not found" : ""
);
assert(
  "no longer logs a fake '[Contact Submission Received]' on failure",
  !contactAction.includes("[Contact Submission Received]")
);
assert(
  "logs the insert failure with console.error",
  /console\.error\("Could not insert into contact_messages table:"/.test(contactAction)
);
assert("success path still returns success: true", /return \{ success: true \};/.test(contactAction));

console.log("\n== 9. subscribeNewsletterAction Never Reports False Success ==");
const newsletterActionUrl = new URL("../app/actions/newsletter.ts", import.meta.url);
const newsletterAction = readSource(newsletterActionUrl);
assert(
  "exports subscribeNewsletterAction",
  newsletterAction.includes("export async function subscribeNewsletterAction")
);
assert(
  "23505 duplicate maps to benign success with code already_subscribed",
  /error\.code === "23505"[\s\S]{0,300}code: "already_subscribed"/.test(newsletterAction)
);
assert(
  "non-duplicate insert failure returns persist_failed",
  /error\.code === "23505"[\s\S]{0,800}code: "persist_failed"/.test(newsletterAction)
);
assert(
  "catch block returns persist_failed (no silent success)",
  /catch \(err\)[\s\S]{0,600}code: "persist_failed"/.test(newsletterAction)
);
assert("validation failure returns code validation", /code: "validation"/.test(newsletterAction));
const newsletterErrBlock = extractBraceBlock(
  newsletterAction,
  newsletterAction.indexOf("if (error) {")
);
assert("if (error) block found in newsletter action", newsletterErrBlock.length > 0);
// The 23505 (duplicate) branch is the ONE place a success outcome is allowed.
const dupBranch = extractBraceBlock(
  newsletterAction,
  newsletterAction.indexOf('error.code === "23505"')
);
assert("23505 duplicate branch block found", dupBranch.length > 0);
const errBlockWithoutDup = newsletterErrBlock.replace(dupBranch, "");
assert(
  "failed-insert block never claims success (outside the 23505 branch)",
  errBlockWithoutDup.length > 0 && !errBlockWithoutDup.includes("success: true")
);
assert(
  "no longer logs a fake '[Newsletter Subscription Received]' on failure",
  !newsletterAction.includes("[Newsletter Subscription Received]")
);
assert(
  "catch block never claims success",
  !extractBraceBlock(newsletterAction, newsletterAction.indexOf("catch (err)")).includes(
    "success: true"
  )
);
assert(
  "logs the insert failure with console.error",
  /console\.error\(\s*"Could not insert into newsletter_subscribers table:"/.test(newsletterAction)
);
console.log("\n== 10. UI Renders Localized Copy ==");
const contactFormUrl = new URL("../components/sections/contact-form.tsx", import.meta.url);
const contactForm = readSource(contactFormUrl);
assert("ContactForm branches on res.success", /if \(res\.success\)/.test(contactForm));
assert('ContactForm renders t("errorServer") on persistence failure', contactForm.includes('t("errorServer")'));
assert('ContactForm renders t("errorValidation") on validation failure', contactForm.includes('t("errorValidation")'));
assert('ContactForm renders t("errorUnexpected") in catch', contactForm.includes('t("errorUnexpected")'));
assert(
  "ContactForm no longer hardcodes an English server-error fallback",
  !contactForm.includes('setServerError(res.error ?? "Failed to send message.')
);
assert(
  "ContactForm no longer hardcodes an English catch message",
  !contactForm.includes("An unexpected error occurred. Please try again.")
);

const newsletterUrl = new URL("../components/sections/newsletter.tsx", import.meta.url);
const newsletter = readSource(newsletterUrl);
assert("Newsletter branches on res.success", /if \(res\.success\)/.test(newsletter));
assert('Newsletter renders t("successDuplicate") for 23505', newsletter.includes('t("successDuplicate")'));
assert('Newsletter renders t("errorEmail") on validation failure', newsletter.includes('t("errorEmail")'));
assert('Newsletter renders t("errorPersist") on persistence failure', newsletter.includes('t("errorPersist")'));
assert('Newsletter renders t("subscribing") while isSubmitting', newsletter.includes('t("subscribing")'));
assert("Newsletter keeps a catch branch", /catch \{/.test(newsletter));

console.log("\n== 11. Bilingual Message Keys (en.json + vi.json) ==");
function loadMessages(file) {
  return JSON.parse(
    fs.readFileSync(new URL(`../messages/${file}`, import.meta.url), "utf8")
  );
}

let en = null;
let vi = null;
try {
  en = loadMessages("en.json");
  vi = loadMessages("vi.json");
  assert("messages/en.json parses", true);
  assert("messages/vi.json parses", true);
} catch (err) {
  assert("messages/en.json + vi.json parse", false, String(err.message));
}

if (en && vi) {
  const requiredContactKeys = ["errorServer", "errorValidation", "errorUnexpected"];
  const requiredNewsletterKeys = ["subscribing", "errorEmail", "errorPersist", "successDuplicate"];

  for (const key of requiredContactKeys) {
    assert(`en.json contact.${key} present`, typeof en.contact?.[key] === "string" && en.contact[key].length > 0);
    assert(`vi.json contact.${key} present`, typeof vi.contact?.[key] === "string" && vi.contact[key].length > 0);
    assert(`contact.${key} differs between en and vi (translated)`, en.contact?.[key] !== vi.contact?.[key]);
  }

  for (const key of requiredNewsletterKeys) {
    assert(`en.json newsletter.${key} present`, typeof en.newsletter?.[key] === "string" && en.newsletter[key].length > 0);
    assert(`vi.json newsletter.${key} present`, typeof vi.newsletter?.[key] === "string" && vi.newsletter[key].length > 0);
    assert(`newsletter.${key} differs between en and vi (translated)`, en.newsletter?.[key] !== vi.newsletter?.[key]);
  }
}

console.log("\n== 12. Validation Types Export Discriminants ==");
const contactValUrl = new URL("../lib/validations/contact.ts", import.meta.url);
const contactVal = readSource(contactValUrl);
assert("exports ContactErrorCode", contactVal.includes("export type ContactErrorCode"));
assert('ContactErrorCode includes "persist_failed"', contactVal.includes('"persist_failed"'));
assert("ContactActionState has code field", /code\?: ContactErrorCode;/.test(contactVal));

const newsletterValUrl = new URL("../lib/validations/newsletter.ts", import.meta.url);
const newsletterVal = readSource(newsletterValUrl);
assert("exports NewsletterErrorCode", newsletterVal.includes("export type NewsletterErrorCode"));
assert('NewsletterErrorCode includes "already_subscribed"', newsletterVal.includes('"already_subscribed"'));
assert("NewsletterActionState has code field", /code\?: NewsletterErrorCode;/.test(newsletterVal));

console.log(`\n${"=".repeat(60)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60));
process.exit(failed > 0 ? 1 : 0);
