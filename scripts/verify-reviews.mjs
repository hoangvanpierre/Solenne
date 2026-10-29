#!/usr/bin/env node
// ===========================================================================
// Solenne — Verification Harness for Verified Customer Reviews (0015)
// ===========================================================================
// Statically verifies the review surface end to end:
//   A. Migration 0015 declares both relations, keys, checks and indexes
//   B. Verification is structural: delivered order evidence is derived by the
//      database, never supplied by the client
//   C. RLS, policies and least-privilege grants (including anon column grants)
//   D. Guard triggers pin identity/evidence/status and restrict moderation to
//      review.manage_reports holders
//   E. The aggregation view is security_invoker and counts published rows only
//   F. The new permission is seeded for manager + admin, never staff/customer
//   G. Server actions derive identity from the session, never the payload
//   H. The data layer reads through the user-scoped client and degrades safely
//   I. Customer UI: product section, form, report control, account invitation
//   J. Admin moderation UI, nav entry and audit trail
//   K. Localization: en/vi parity and every used key exists
//
// Read-only: never touches a database or the network.
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

function readSource(url) {
  return fs.readFileSync(url, "utf8").replace(/\r\n/g, "\n");
}

function readJson(url) {
  return JSON.parse(readSource(url));
}

function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const index = line.indexOf("--");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

/** Resolve a dotted next-intl key ("account.title") inside a message object. */
function hasMessage(messages, key) {
  return key.split(".").reduce((value, part) => {
    if (value && typeof value === "object") return value[part];
    return undefined;
  }, messages);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const MIGRATION = new URL(
  "../supabase/migrations/0015_reviews.sql",
  import.meta.url
);
const CUSTOMER_ACTIONS = new URL("../app/actions/reviews.ts", import.meta.url);
const MODERATION_ACTIONS = new URL(
  "../app/actions/review-moderation.ts",
  import.meta.url
);
const DATA_LAYER = new URL("../lib/reviews.ts", import.meta.url);
const ADMIN_DATA = new URL("../lib/admin-reviews.ts", import.meta.url);
const TYPES = new URL("../types/review.ts", import.meta.url);
const USER_TYPES = new URL("../types/user.ts", import.meta.url);
const PRODUCT_REVIEWS = new URL(
  "../components/reviews/product-reviews.tsx",
  import.meta.url
);
const REVIEW_FORM = new URL(
  "../components/reviews/review-form.tsx",
  import.meta.url
);
const REPORT_CONTROL = new URL(
  "../components/reviews/review-report-control.tsx",
  import.meta.url
);
const INVITATION = new URL(
  "../components/reviews/review-invitation.tsx",
  import.meta.url
);
const SUMMARY = new URL(
  "../components/reviews/review-summary.tsx",
  import.meta.url
);
const PRODUCT_INFO = new URL(
  "../components/product/product-info.tsx",
  import.meta.url
);
const PRODUCT_PAGE = new URL(
  "../app/(marketing)/products/[slug]/page.tsx",
  import.meta.url
);
const ORDERS_PAGE = new URL(
  "../app/(marketing)/account/orders/page.tsx",
  import.meta.url
);
const ADMIN_PAGE = new URL("../app/admin/reviews/page.tsx", import.meta.url);
const ADMIN_CONTROL = new URL(
  "../components/admin/review-moderation-control.tsx",
  import.meta.url
);
const ADMIN_NAV = new URL("../lib/admin-nav.ts", import.meta.url);
const REDIRECT = new URL("../lib/redirect.ts", import.meta.url);
const AUDIT_UTILS = new URL("../lib/audit-utils.ts", import.meta.url);
const EN = new URL("../messages/en.json", import.meta.url);
const VI = new URL("../messages/vi.json", import.meta.url);

// ---------------------------------------------------------------------------
console.log("== A. Migration 0015: schema, keys and checks ==");
// ---------------------------------------------------------------------------
assert("migration 0015 exists", fs.existsSync(MIGRATION));

const sql = readSource(MIGRATION);
const ddl = stripSqlComments(sql);

assert(
  "creates public.product_reviews idempotently",
  ddl.includes("create table if not exists public.product_reviews")
);
assert(
  "creates public.review_reports idempotently",
  ddl.includes("create table if not exists public.review_reports")
);
assert(
  "product_reviews.id is a uuid primary key",
  /id uuid primary key default gen_random_uuid\(\)/i.test(ddl)
);
assert(
  "product_id references products ON DELETE RESTRICT",
  /product_id uuid not null\s*\n?\s*references public\.products\(id\) on delete restrict/i.test(
    ddl
  )
);
assert(
  "user_id references profiles ON DELETE CASCADE",
  /user_id uuid not null\s*\n?\s*references public\.profiles\(id\) on delete cascade/i.test(
    ddl
  )
);
assert(
  "order_item_id is NOT NULL and references order_items ON DELETE RESTRICT",
  /order_item_id uuid not null\s*\n?\s*references public\.order_items\(id\) on delete restrict/i.test(
    ddl
  ) &&
    /alter column order_item_id set not null/i.test(ddl) &&
    /foreign key \(order_item_id\)[\s\S]{0,120}references public\.order_items\(id\)[\s\S]{0,80}on delete restrict/i.test(
      ddl
    )
);
assert(
  "purchase evidence can never be silently detached (no SET NULL)",
  !/order_item_id[\s\S]{0,120}on delete set null/i.test(ddl)
);
assert(
  "one review per customer per product",
  /unique \(user_id, product_id\)/i.test(ddl)
);
assert(
  "rating is constrained to 1–5",
  /product_reviews_rating_check check \(rating between 1 and 5\)/i.test(ddl)
);
assert(
  "title and body have database bounds",
  /product_reviews_title_check/.test(ddl) &&
    /product_reviews_body_check/.test(ddl)
);
assert(
  "status is limited to published/hidden (no pending state)",
  /product_reviews_status_check[\s\S]{0,80}status in \('published', 'hidden'\)/i.test(
    ddl
  ) && !/pending/i.test(ddl.match(/product_reviews_status_check[\s\S]{0,120}/)?.[0] ?? "")
);
assert(
  "a hidden review must carry a reason",
  /product_reviews_hidden_reason_check/.test(ddl) &&
    /status <> 'hidden'[\s\S]{0,80}char_length\(btrim\(coalesce\(hidden_reason, ''\)\)\) >= 3/i.test(
      ddl
    )
);
assert(
  "review_reports is unique per (review, reporter)",
  /review_reports_review_reporter_key unique \(review_id, reporter_id\)/i.test(
    ddl
  )
);
assert(
  "report reasons are a closed set",
  /review_reports_reason_check/.test(ddl) &&
    /'personal_information'/.test(ddl)
);
assert(
  "report status is open/resolved/dismissed",
  /review_reports_status_check[\s\S]{0,80}status in \('open', 'resolved', 'dismissed'\)/i.test(
    ddl
  )
);
assert(
  "indexes the public listing and the moderation queue",
  /product_reviews_product_status_created_idx/.test(ddl) &&
    /review_reports_status_created_idx/.test(ddl)
);

// ---------------------------------------------------------------------------
console.log("\n== B. Structural verification (purchase evidence) ==");
// ---------------------------------------------------------------------------
assert(
  "the INSERT policy requires a delivered order item owned by the caller",
  /product_reviews_insert_own[\s\S]{0,500}oi\.product_id = product_reviews\.product_id[\s\S]{0,200}o\.user_id = auth\.uid\(\)[\s\S]{0,120}o\.status = 'delivered'/i.test(
    ddl
  )
);
assert(
  "the guard trigger derives order_item_id from the database",
  /select oi\.id\s*\n?\s*into v_order_item_id[\s\S]{0,400}o\.status = 'delivered'/i.test(
    ddl
  )
);
assert(
  "the trigger rejects an ineligible insert",
  /raise exception 'REVIEW_ELIGIBILITY_REQUIRED'/.test(ddl)
);
assert(
  "the trigger derives user_id from auth.uid(), never from the payload",
  /v_actor_id := auth\.uid\(\)/.test(ddl) &&
    /new\.user_id := v_actor_id/.test(ddl)
);
assert(
  "the trigger generates a per-review pseudonym instead of a profile name",
  /new\.display_name := 'Solenne Customer #' \|\| upper\(substr\(replace\(new\.id::text, '-', ''\), 1, 8\)\)/.test(
    ddl
  ) && !/profiles\.full_name/.test(ddl)
);
assert(
  "the trigger forces status='published' on insert",
  /new\.status := 'published'/.test(ddl)
);
assert(
  "the trigger clears moderation fields on insert",
  /new\.hidden_reason := null/.test(ddl) &&
    /new\.hidden_by := null/.test(ddl) &&
    /new\.hidden_at := null/.test(ddl)
);
assert(
  "the trigger pins identity/evidence on update",
  /new\.product_id := old\.product_id/.test(ddl) &&
    /new\.user_id := old\.user_id/.test(ddl) &&
    /new\.order_item_id := old\.order_item_id/.test(ddl) &&
    /new\.display_name := old\.display_name/.test(ddl)
);
assert(
  "authors cannot edit a hidden review",
  /raise exception 'REVIEW_HIDDEN_READONLY'/.test(ddl)
);
assert(
  "moderation requires review.manage_reports inside the trigger",
  /if not public\.has_permission\('review\.manage_reports'\) then[\s\S]{0,120}REVIEW_UPDATE_FORBIDDEN/i.test(
    ddl
  )
);
assert(
  "moderators cannot rewrite the customer's rating/title/body",
  /new\.rating := old\.rating/.test(ddl) &&
    /new\.title := old\.title/.test(ddl) &&
    /new\.body := old\.body/.test(ddl)
);
assert(
  "hiding requires a reason and records the moderator",
  /REVIEW_HIDE_REASON_REQUIRED/.test(ddl) &&
    /new\.hidden_by := v_actor_id/.test(ddl) &&
    /new\.hidden_at := now\(\)/.test(ddl)
);
assert(
  "only published -> hidden is a valid visibility transition",
  /REVIEW_STATUS_TRANSITION_INVALID/.test(ddl)
);
assert(
  "the report trigger refuses missing, hidden and self reports",
  /REVIEW_NOT_FOUND/.test(ddl) &&
    /REVIEW_NOT_REPORTABLE/.test(ddl) &&
    /REVIEW_SELF_REPORT/.test(ddl)
);
assert(
  "the report trigger pins review_id/reporter_id/reason/details",
  /new\.review_id := old\.review_id/.test(ddl) &&
    /new\.reporter_id := old\.reporter_id/.test(ddl) &&
    /new\.reason := old\.reason/.test(ddl) &&
    /new\.details := old\.details/.test(ddl)
);
assert(
  "a resolved report cannot be re-resolved",
  /REPORT_ALREADY_RESOLVED/.test(ddl)
);
assert(
  "the report trigger derives reporter_id from auth.uid() and forces open",
  /new\.reporter_id := v_actor_id/.test(ddl) &&
    /new\.status := 'open'/.test(ddl)
);
assert(
  "only the database owner bypasses the guards (service_role is not trusted)",
  /v_requesting_role in \('postgres', 'supabase_admin'\)/.test(ddl) &&
    !/requesting_role\(\) in \('service_role'/.test(ddl)
);
assert(
  "moderation writes its audit row inside the same transaction",
  /insert into public\.audit_logs \([\s\S]{0,200}'review\.hidden'/.test(ddl) &&
    /insert into public\.audit_logs \([\s\S]{0,300}'review\.report_resolved'/.test(
      ddl
    ) &&
    /'review\.report_dismissed'/.test(ddl)
);
assert(
  "the review audit row names the product review resource",
  /'review\.hidden',\s*\n?\s*'product_review'/.test(ddl)
);
assert(
  "the report audit row names the review report resource",
  /'review_report',\s*\n?\s*old\.id::text/.test(ddl)
);
assert(
  "the audit metadata records the actor role and status transition",
  /'actor_role', public\.current_role_name\(\)/.test(ddl) &&
    /'previous_status', old\.status/.test(ddl) &&
    /'new_status', new\.status/.test(ddl)
);
assert(
  "a report never hides its review",
  !/update public\.product_reviews[\s\S]{0,200}review_reports_guard/i.test(ddl)
);
assert(
  "the own-review RPC exists, is scoped to auth.uid() and an active account",
  /create or replace function public\.get_my_product_review\(p_product_id uuid\)/.test(
    ddl
  ) &&
    /r\.user_id = auth\.uid\(\)/.test(ddl) &&
    /public\.is_active_account\(\)/.test(ddl)
);
assert(
  "the RPC returns no user_id or purchase evidence",
  (() => {
    const fn = ddl.match(
      /create or replace function public\.get_my_product_review[\s\S]*?\$\$;/i
    )?.[0];
    if (!fn) return false;
    return !/user_id,/.test(fn) && !/order_item_id/.test(fn);
  })()
);
assert(
  "the RPC is SECURITY DEFINER, stable and not executable by anon",
  /security definer/.test(
    ddl.match(
      /create or replace function public\.get_my_product_review[\s\S]*?\$\$;/i
    )?.[0] ?? ""
  ) &&
    /grant execute on function public\.get_my_product_review\(uuid\) to authenticated;/.test(
      ddl
    ) &&
    /revoke all on function public\.get_my_product_review\(uuid\) from anon;/.test(
      ddl
    )
);

// ---------------------------------------------------------------------------
console.log("\n== C. RLS and least-privilege grants ==");
// ---------------------------------------------------------------------------
assert(
  "RLS is enabled on both relations",
  ddl.includes("alter table public.product_reviews enable row level security;") &&
    ddl.includes("alter table public.review_reports enable row level security;")
);
assert(
  "anon sees published reviews only",
  /product_reviews_select_public[\s\S]{0,120}for select to anon[\s\S]{0,80}using \(status = 'published'\)/i.test(
    ddl
  )
);
assert(
  "authenticated sees published + own + manager rows",
  /product_reviews_select_visible[\s\S]{0,300}status = 'published'[\s\S]{0,120}user_id = auth\.uid\(\)[\s\S]{0,120}has_permission\('review\.manage_reports'\)/i.test(
    ddl
  )
);
assert(
  "the update policy carries BOTH USING and WITH CHECK",
  /product_reviews_update_owner_or_manager[\s\S]*?using \([\s\S]*?\)\s*\n?\s*with check \(/i.test(
    ddl
  )
);
assert(
  "the report update policy carries BOTH USING and WITH CHECK",
  /review_reports_update_manager[\s\S]*?using \([\s\S]*?\)\s*\n?\s*with check \(/i.test(
    ddl
  )
);
assert(
  "no DELETE policy exists on either relation",
  !/create policy[\s\S]{0,160}for delete/i.test(ddl)
);
assert(
  "anon privileges are revoked first",
  /revoke all on table public\.product_reviews from anon;/i.test(ddl) &&
    /revoke all on table public\.review_reports from anon;/i.test(ddl)
);
assert(
  "anon gets column-level SELECT on product_reviews only",
  /grant select \([\s\S]{0,300}\) on table public\.product_reviews to anon;/i.test(
    ddl
  ) && !/grant select \([\s\S]{0,300}\) on table public\.review_reports to anon;/i.test(
    ddl
  )
);
assert(
  "the anon column grant excludes user_id, order_item_id and hidden_*",
  (() => {
    const grant = ddl.match(
      /grant select \(([\s\S]*?)\) on table public\.product_reviews to anon;/i
    )?.[1];
    if (!grant) return false;
    return (
      !/\buser_id\b/.test(grant) &&
      !/\border_item_id\b/.test(grant) &&
      !/\bhidden_/.test(grant)
    );
  })()
);
assert(
  "customers may INSERT exactly product_id, rating, title and body",
  /grant insert \(product_id, rating, title, body\)[\s\S]{0,80}to authenticated;/i.test(
    ddl
  ) &&
    !/grant insert \([^)]*user_id[^)]*\)[\s\S]{0,80}to authenticated;/i.test(ddl)
);
assert(
  "authenticated SELECT excludes user_id and purchase evidence",
  (() => {
    const grant = ddl.match(
      /grant select \(([\s\S]*?)\) on table public\.product_reviews to authenticated;/i
    )?.[1];
    if (!grant) return false;
    return (
      !/\buser_id\b/.test(grant) &&
      !/\border_item_id\b/.test(grant) &&
      /\bhidden_reason\b/.test(grant)
    );
  })()
);
assert(
  "customers never receive DELETE",
  /revoke delete on table public\.product_reviews from [^;]*authenticated/i.test(
    ddl
  ) &&
    /revoke delete on table public\.review_reports from [^;]*authenticated/i.test(
      ddl
    )
);
assert(
  "reports expose no reporter identity and INSERT only three fields",
  (() => {
    const selectGrant = ddl.match(
      /grant select \(([\s\S]*?)\) on table public\.review_reports to authenticated;/i
    )?.[1];
    return (
      Boolean(selectGrant) &&
      !/\breporter_id\b/.test(selectGrant) &&
      !/\bresolved_by\b/.test(selectGrant) &&
      /grant insert \(review_id, reason, details\)[\s\S]{0,80}to authenticated;/i.test(
        ddl
      )
    );
  })()
);
assert(
  "report resolution is column-limited to status + note",
  /grant update \(status, resolution_note\)[\s\S]{0,80}to authenticated;/i.test(
    ddl
  )
);
assert(
  "service_role is read-only on reviews, reports and the stats view",
  /grant select on table public\.product_reviews to service_role;/i.test(ddl) &&
    /grant select on table public\.review_reports to service_role;/i.test(ddl) &&
    /grant select on table public\.product_review_stats to service_role;/i.test(
      ddl
    ) &&
    !/grant [^;]*\b(insert|update|delete)\b[^;]*to service_role;/i.test(ddl)
);
assert(
  "the migration self-verifies service_role's read-only status",
  /service_role must be read-only on review tables/.test(sql)
);
assert(
  "the guard functions are SECURITY DEFINER with an empty search_path",
  (ddl.match(/security definer/gi) ?? []).length >= 2 &&
    (ddl.match(/set search_path = ''/gi) ?? []).length >= 2
);
assert(
  "guard functions are not executable by API roles",
  /revoke all on function public\.product_reviews_guard\(\) from authenticated;/i.test(
    ddl
  ) &&
    /revoke all on function public\.review_reports_guard\(\) from authenticated;/i.test(
      ddl
    )
);

// ---------------------------------------------------------------------------
console.log("\n== D. Aggregation view ==");
// ---------------------------------------------------------------------------
assert(
  "product_review_stats is a security_invoker view",
  /create or replace view public\.product_review_stats\s*\n?\s*with \(security_invoker = true\)/i.test(
    ddl
  )
);
assert(
  "the view counts published rows only",
  /from public\.product_reviews\s*\n?\s*where status = 'published'/i.test(ddl)
);
assert(
  "the view exposes the 1–5 distribution",
  /rating_5/.test(ddl) &&
    /rating_4/.test(ddl) &&
    /rating_3/.test(ddl) &&
    /rating_2/.test(ddl) &&
    /rating_1/.test(ddl)
);
assert(
  "the view is read-only to anon/authenticated",
  /grant select on table public\.product_review_stats to anon;/i.test(ddl) &&
    /grant select on table public\.product_review_stats to authenticated;/i.test(
      ddl
    )
);

// ---------------------------------------------------------------------------
console.log("\n== E. RBAC permission: review.manage_reports ==");
// ---------------------------------------------------------------------------
assert(
  "the permission is seeded idempotently",
  /insert into public\.permissions[\s\S]{0,200}'review\.manage_reports'/.test(
    ddl
  ) && /on conflict \(key\) do update/i.test(ddl)
);
assert(
  "only manager and admin are granted the permission",
  /where r\.name in \('manager', 'admin'\)/.test(ddl)
);
assert(
  "staff and customer are explicitly excluded",
  /r\.name in \('staff', 'customer'\)/.test(sql)
);
assert(
  "the self-verification block checks the permission matrix",
  /review\.manage_reports must be granted to manager and admin/.test(sql) &&
    /review\.manage_reports must not be granted to staff or customer/.test(sql)
);
assert(
  "the migration ends with a success notice",
  /--- Solenne 0015 OK:/.test(sql)
);
assert(
  "the self-verification block fails loudly",
  /raise exception 'Migration 0015 failed:/.test(sql)
);

// ---------------------------------------------------------------------------
console.log("\n== F. Customer server actions ==");
// ---------------------------------------------------------------------------
assert("app/actions/reviews.ts exists", fs.existsSync(CUSTOMER_ACTIONS));

const actions = readSource(CUSTOMER_ACTIONS);

assert('is a server-action module', /^"use server";/m.test(actions));
assert(
  "exports create/update/report actions",
  /export async function createReviewAction/.test(actions) &&
    /export async function updateReviewAction/.test(actions) &&
    /export async function reportReviewAction/.test(actions)
);
assert(
  "authorizes through requireActiveActor()",
  /requireActiveActor\(\)/.test(actions)
);
assert(
  "uses the user-scoped server client",
  /from "@\/lib\/supabase\/server"/.test(actions)
);
assert(
  "never imports the service-role client",
  !/supabase\/admin/.test(actions) &&
    !/createAdminClient/.test(actions) &&
    !/SUPABASE_SECRET_KEY/.test(actions)
);
assert(
  "identity is resolved from the session, never the payload",
  /requireActiveActor\(\)/.test(actions) &&
    !/input\.userId|input\.user_id|body\.userId|body\.user_id/.test(actions) &&
    !/user_id:\s*actor\.userId/.test(actions)
);
assert(
  "the insert uses the four-field payload builder",
  /\.insert\(buildReviewInsertPayload\(\{ productId, rating, title, body \}\)\)/.test(
    actions
  ) &&
    !/\.insert\(\{[\s\S]{0,300}(user_id|status|display_name|order_item_id|hidden_)/.test(
      actions
    )
);
assert(
  "the update uses the content-only payload builder on the own-review id",
  /\.update\(buildReviewUpdatePayload\(\{ rating, title, body \}\)\)/.test(
    actions
  ) &&
    /getMyProductReview\(productId\)/.test(actions) &&
    /\.eq\("id", ownReview\.id\)/.test(actions) &&
    !/\.eq\("user_id"/.test(actions)
);
assert(
  "eligibility is re-checked before publishing",
  /getReviewEligibilityForViewer/.test(actions) &&
    /hasDeliveredPurchase/.test(actions)
);
assert(
  "a duplicate review is reported as an editable duplicate",
  /isDuplicateReviewError/.test(actions) && /code: "duplicate"/.test(actions)
);
assert(
  "a hidden review cannot be edited",
  /REVIEW_HIDDEN_READONLY/.test(actions) &&
    /code: "hidden_readonly"/.test(actions)
);
assert(
  "the report uses the three-field payload builder",
  /\.from\("review_reports"\)[\s\S]{0,40}\.insert\(buildReviewReportInsertPayload\(\{ reviewId, reason, details \}\)\)/.test(
    actions
  ) && !/reporter_id\s*:/.test(actions)
);
assert(
  "reports are idempotent per customer",
  /isDuplicateReviewError/.test(actions) &&
    /code: "already_reported"/.test(actions)
);
assert(
  "a missing schema degrades instead of crashing",
  /isMissingReviewSchema/.test(actions) && /code: "unavailable"/.test(actions)
);

// ---------------------------------------------------------------------------
console.log("\n== G. Moderation actions + audit trail ==");
// ---------------------------------------------------------------------------
assert("app/actions/review-moderation.ts exists", fs.existsSync(MODERATION_ACTIONS));

const moderation = readSource(MODERATION_ACTIONS);

assert('is a server-action module', /^"use server";/m.test(moderation));
assert(
  "exports hide and resolution actions",
  /export async function hideReviewAction/.test(moderation) &&
    /export async function resolveReviewReportAction/.test(moderation)
);
assert(
  "both actions require review.manage_reports",
  (moderation.match(/requirePermission\("review\.manage_reports"\)/g) ?? [])
    .length >= 2
);
assert(
  "moderation performs no application-level audit write",
  !/writeAuditLog/.test(moderation) &&
    !/from "@\/lib\/audit"/.test(moderation) &&
    !/"review\.(hidden|report_resolved|report_dismissed)"/.test(moderation)
);
assert(
  "hiding sends only status + hidden_reason",
  /buildReviewHidePayload/.test(moderation) &&
    /\.update\(buildReviewHidePayload\(reason\)\)/.test(moderation)
);
assert(
  "closing a report sends only status + resolution_note",
  /buildReviewReportResolutionPayload/.test(moderation) &&
    /\.update\(buildReviewReportResolutionPayload\(resolution, note\)\)/.test(
      moderation
    )
);
assert(
  "moderation never sends a moderator identity or timestamp",
  !/\b(hidden_by|hidden_at|resolved_by|resolved_at):/.test(moderation)
);
assert(
  "hiding records a mandatory reason",
  /REVIEW_HIDE_REASON_REQUIRED/.test(moderation)
);
const hideBlock = moderation.slice(
  moderation.indexOf("export async function hideReviewAction"),
  moderation.indexOf("export async function resolveReviewReportAction")
);
const resolveBlock = moderation.slice(
  moderation.indexOf("export async function resolveReviewReportAction")
);

assert(
  "hiding and closing a report are separate actions",
  /product_reviews/.test(hideBlock) &&
    !/review_reports/.test(hideBlock) &&
    /review_reports/.test(resolveBlock)
);
assert(
  "moderation uses the user-scoped client",
  /from "@\/lib\/supabase\/server"/.test(moderation) &&
    !/supabase\/admin/.test(moderation)
);
assert(
  "moderation revalidates the admin queue and storefront",
  /revalidatePath\("\/admin\/reviews"\)/.test(moderation) &&
    /revalidatePath\("\/admin\/audit"\)/.test(moderation) &&
    /revalidatePath\("\/products"\)/.test(moderation)
);

const audit = readSource(AUDIT_UTILS);
assert(
  "audit actions include every review action",
  /"review\.hidden"/.test(audit) &&
    /"review\.report_resolved"/.test(audit) &&
    /"review\.report_dismissed"/.test(audit)
);
assert(
  "review is a first-class audit category and resource",
  /"review",/.test(audit) &&
    /"product_review",/.test(audit) &&
    /"review_report",/.test(audit) &&
    /case "review\.hidden"/.test(audit)
);
assert(
  "the audit summary reads the database-written metadata keys",
  /metadata\.resolution_note/.test(audit) &&
    /metadata\.reason/.test(audit) &&
    !/metadata\.review_title/.test(audit)
);

// ---------------------------------------------------------------------------
console.log("\n== H. Data layer ==");
// ---------------------------------------------------------------------------
assert("lib/reviews.ts exists", fs.existsSync(DATA_LAYER));
assert("lib/admin-reviews.ts exists", fs.existsSync(ADMIN_DATA));

const dataLayer = readSource(DATA_LAYER);
const adminData = readSource(ADMIN_DATA);

assert(
  "the storefront reader uses the user-scoped client",
  /from "@\/lib\/supabase\/server"/.test(dataLayer) &&
    !/supabase\/admin/.test(dataLayer)
);
assert(
  "published reviews are filtered by status = published",
  /\.eq\("status", "published"\)/.test(dataLayer)
);
assert(
  "the aggregate comes from product_review_stats",
  /from\("product_review_stats"\)/.test(dataLayer)
);
assert(
  "the viewer's own review is loaded through the own-review RPC",
  /getMyProductReview/.test(dataLayer) &&
    /\.rpc\(\s*GET_MY_PRODUCT_REVIEW_RPC,\s*\{\s*\n?\s*p_product_id: productId,/.test(
      dataLayer
    )
);
assert(
  "the data layer never filters product_reviews by user_id",
  !/from\("product_reviews"\)[\s\S]{0,200}\.eq\("user_id"/.test(dataLayer) &&
    !/\.eq\("user_id", userId\)[\s\S]{0,120}product_reviews/.test(dataLayer)
);
assert(
  "the data layer never queries review_reports by reporter_id",
  !/from\("review_reports"\)/.test(dataLayer) &&
    !/reporter_id/.test(dataLayer)
);
assert(
  "the public review column list excludes hidden_reason",
  (() => {
    const columns = dataLayer.match(
      /const REVIEW_COLUMNS =\s*\n?\s*"([^"]+)"/i
    )?.[1];
    return Boolean(columns) && !/hidden_reason/.test(columns);
  })()
);
assert(
  "reviewable items resolve each product's review through the RPC",
  /getOwnReviewIds/.test(dataLayer) &&
    (dataLayer.match(/GET_MY_PRODUCT_REVIEW_RPC/g) ?? []).length >= 2
);
assert(
  "guests get a safe page payload with no query failure",
  /guestPageData/.test(dataLayer) && /isAuthenticated: false/.test(dataLayer)
);
assert(
  "a missing schema yields available: false",
  /available = false/.test(dataLayer) &&
    /isMissingReviewSchema/.test(dataLayer)
);
assert(
  "delivered purchase evidence is checked server-side",
  /\.eq\("status", "delivered"\)/.test(dataLayer)
);
assert(
  "reviewable items are limited to active products",
  /getProductsByIds/.test(dataLayer) && /order\.status !== "delivered"/.test(dataLayer)
);
assert(
  "the moderation queue re-checks the permission",
  /requirePermission\("review\.manage_reports"\)/.test(adminData)
);
assert(
  "the moderation queue reads through the user-scoped client",
  /from "@\/lib\/supabase\/server"/.test(adminData) &&
    !/supabase\/admin/.test(adminData)
);
assert(
  "the queue supports open/resolved/dismissed/all filters",
  /"open",[\s\S]{0,80}"resolved",[\s\S]{0,80}"dismissed",[\s\S]{0,80}"all"/.test(
    adminData
  )
);
assert(
  "the moderation queue reads no reporter identity or purchase evidence",
  !/reporter_id/.test(adminData) &&
    !/\buser_id\b/.test(adminData) &&
    !/order_item_id/.test(adminData)
);
assert(
  "the moderation queue selects only granted report columns",
  (() => {
    const columns = adminData.match(
      /\.from\("review_reports"\)\s*\n?\s*\.select\(\s*\n?\s*"([^"]+)"/i
    )?.[1];
    return (
      Boolean(columns) &&
      !/reporter_id/.test(columns) &&
      !/resolved_by/.test(columns)
    );
  })()
);

// ---------------------------------------------------------------------------
console.log("\n== I. Customer UI wiring ==");
// ---------------------------------------------------------------------------
for (const [label, url] of [
  ["product-reviews.tsx", PRODUCT_REVIEWS],
  ["review-form.tsx", REVIEW_FORM],
  ["review-report-control.tsx", REPORT_CONTROL],
  ["review-invitation.tsx", INVITATION],
  ["review-summary.tsx", SUMMARY],
  ["product page", PRODUCT_PAGE],
  ["account orders page", ORDERS_PAGE],
]) {
  assert(`${label} exists`, fs.existsSync(url));
}

const productReviews = readSource(PRODUCT_REVIEWS);
const reviewForm = readSource(REVIEW_FORM);
const reportControl = readSource(REPORT_CONTROL);
const invitation = readSource(INVITATION);
const summary = readSource(SUMMARY);
const productPage = readSource(PRODUCT_PAGE);
const ordersPage = readSource(ORDERS_PAGE);
const productInfo = readSource(PRODUCT_INFO);

assert(
  "the product page renders the reviews section and anchor",
  /<ProductReviews/.test(productPage) && /id="reviews"/.test(productPage)
);
assert(
  "the product page loads review data in one server pass",
  /getProductReviewsPageData\(product\.id\)/.test(productPage)
);
assert(
  "the product page builds a login return path to the review anchor",
  /\/login\?next=\$\{encodeURIComponent\(/.test(productPage) &&
    /#reviews/.test(productPage)
);
assert(
  "the product header shows the real aggregate, not a hardcoded rating",
  /reviewSummary/.test(productInfo) &&
    /<StarRating/.test(productInfo) &&
    !/4\.8 \(24\)/.test(productInfo)
);
assert(
  "the review section shows a verified-purchase badge",
  /t\("verifiedPurchase"\)/.test(productReviews)
);
assert(
  "the review section offers sorting over the loaded window",
  /REVIEW_SORTS/.test(productReviews) && /sortReviews/.test(productReviews)
);
assert(
  "the review section announces publication to screen readers",
  /role="status"/.test(productReviews) && /aria-live="polite"/.test(productReviews)
);
assert(
  "guests are sent to login instead of a broken form",
  /loginHref/.test(productReviews)
);
assert(
  "the form publishes immediately (create) and supports editing",
  /createReviewAction/.test(reviewForm) &&
    /updateReviewAction/.test(reviewForm) &&
    /mode === "edit"/.test(reviewForm)
);
assert(
  "the form maps server field errors onto localized copy",
  /reviewErrorKey/.test(reviewForm) && /fieldErrors\.rating/.test(reviewForm)
);
assert(
  "the report control only sends reason + details",
  /reportReviewAction\(\{ reviewId, reason, details \}\)/.test(reportControl)
);
assert(
  "the report control never hides anything by itself",
  !/hideReviewAction/.test(reportControl)
);
assert(
  "the report control is localized and accessible",
  /useTranslations\("reviews"\)/.test(reportControl) &&
    /role="alert"/.test(reportControl)
);
assert(
  "the summary renders average, count and 5→1 distribution",
  /averageRating/.test(summary) &&
    /\[5, 4, 3, 2, 1\]/.test(summary) &&
    /reviewDistributionPercent/.test(summary)
);
assert(
  "the account invitation only lists delivered items",
  /getReviewableDeliveredItems/.test(invitation) &&
    /item\.reviewId/.test(invitation)
);
assert(
  "the account orders page mounts the invitation in its own Suspense",
  /<ReviewInvitation/.test(ordersPage) &&
    /Suspense/.test(ordersPage)
);

// ---------------------------------------------------------------------------
console.log("\n== J. Admin moderation UI + navigation ==");
// ---------------------------------------------------------------------------
assert("app/admin/reviews/page.tsx exists", fs.existsSync(ADMIN_PAGE));
assert("review-moderation-control.tsx exists", fs.existsSync(ADMIN_CONTROL));

const adminPage = readSource(ADMIN_PAGE);
const adminControl = readSource(ADMIN_CONTROL);
const adminNav = readSource(ADMIN_NAV);
const redirect = readSource(REDIRECT);
const userTypes = readSource(USER_TYPES);
const reviewTypes = readSource(TYPES);

assert(
  "the admin page gates on review.manage_reports",
  /requirePermission\("review\.manage_reports"\)/.test(adminPage)
);
assert(
  "the admin page normalizes and applies the status filter",
  /normalizeReviewReportStatusFilter/.test(adminPage) &&
    /getAdminReviewReports\(filter\)/.test(adminPage)
);
assert(
  "the admin page shows the open-report count",
  /countOpenReviewReports/.test(adminPage)
);
assert(
  "the admin page handles restricted, forbidden and load failures",
  /RestrictedAccountNotice/.test(adminPage) &&
    /forbiddenAccess/.test(adminPage) &&
    /loadFailed/.test(adminPage)
);
assert(
  "the admin page degrades honestly when 0015 is absent",
  /isMissingReviewSchema/.test(adminPage) && /schemaUnavailable/.test(adminPage)
);
assert(
  "the admin page renders the moderation control per report",
  /<ReviewModerationControl/.test(adminPage)
);
assert(
  "the moderation control hides through the audited action",
  /hideReviewAction/.test(adminControl)
);
assert(
  "the moderation control resolves and dismisses reports",
  /resolveReviewReportAction/.test(adminControl) &&
    /resolution === "resolved"/.test(adminControl)
);
assert(
  "the moderation control refreshes server data after success",
  /router\.refresh\(\)/.test(adminControl)
);
assert(
  "the moderation control localizes failures",
  /reviewModerationErrorKey/.test(adminControl) &&
    /useTranslations\("reviewsAdmin"\)/.test(adminControl)
);
assert(
  "the moderation control exposes errors and success to assistive tech",
  /role="alert"/.test(adminControl) && /aria-live="polite"/.test(adminControl)
);
assert(
  "the admin nav exposes /admin/reviews gated by the permission",
  /href: "\/admin\/reviews"/.test(adminNav) &&
    /requires: \["review\.manage_reports"\]/.test(adminNav)
);
assert(
  "the permission also grants /admin access",
  /"review\.manage_reports",/.test(redirect)
);
assert(
  "the permission key exists in the shared type",
  /"review\.manage_reports"/.test(userTypes)
);
const reviewTypesCode = reviewTypes
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

assert(
  "the public review model omits user/order ids",
  !/\buserId\s*:/.test(reviewTypesCode) &&
    !/\borderItemId\s*:/.test(reviewTypesCode) &&
    !/\breporterId\s*:/.test(reviewTypesCode)
);
assert(
  "the page payload no longer carries reported review ids",
  !/reportedReviewIds/.test(reviewTypesCode) &&
    !/reportedReviewIds/.test(productReviews)
);
assert(
  "the own-review RPC row model exposes no author id or evidence",
  (() => {
    const row = reviewTypesCode.match(
      /export interface OwnProductReviewRow \{([\s\S]*?)\}/
    )?.[1];
    return (
      Boolean(row) &&
      !/\buser_id\b/.test(row) &&
      !/\border_item_id\b/.test(row) &&
      /\bhidden_reason\b/.test(row)
    );
  })()
);
assert(
  "the public review model carries the verified-by-construction contract",
  /verified purchase/i.test(reviewTypes) && /by construction/i.test(reviewTypes)
);

// ---------------------------------------------------------------------------
console.log("\n== K. Localization: en/vi parity and key coverage ==");
// ---------------------------------------------------------------------------
const en = readJson(EN);
const vi = readJson(VI);

assert("messages/en.json has a reviews block", Boolean(en.reviews));
assert("messages/vi.json has a reviews block", Boolean(vi.reviews));
assert("messages/en.json has a reviewsAdmin block", Boolean(en.reviewsAdmin));
assert("messages/vi.json has a reviewsAdmin block", Boolean(vi.reviewsAdmin));

function flattenKeys(value, prefix = "") {
  return Object.entries(value ?? {}).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object"
      ? flattenKeys(child, path)
      : [path];
  });
}

for (const namespace of ["reviews", "reviewsAdmin"]) {
  const enKeys = flattenKeys(en[namespace]).sort();
  const viKeys = flattenKeys(vi[namespace]).sort();

  assert(
    `${namespace}: en and vi expose the same keys`,
    enKeys.length === viKeys.length &&
      enKeys.every((key, index) => key === viKeys[index]),
    `en=${enKeys.length} vi=${viKeys.length}`
  );

  for (const key of enKeys) {
    assert(
      `${namespace}.${key} is translated in both locales`,
      isNonEmptyString(hasMessage(en[namespace], key)) &&
        isNonEmptyString(hasMessage(vi[namespace], key))
    );
  }
}

assert(
  "the two locales actually differ (not copy-pasted English)",
  en.reviews.title !== vi.reviews.title &&
    en.reviewsAdmin.title !== vi.reviewsAdmin.title
);

// Every literal t("…") key used by the customer UI must exist.
const customerSources = [
  productReviews,
  reviewForm,
  reportControl,
  invitation,
  summary,
  productInfo,
];
const usedCustomerKeys = new Set();
for (const source of customerSources) {
  for (const match of source.matchAll(/\bt(?:Reviews)?\("([A-Za-z0-9_.]+)"/g)) {
    usedCustomerKeys.add(match[1]);
  }
}
const missingCustomerKeys = [...usedCustomerKeys].filter(
  (key) => !isNonEmptyString(hasMessage(en.reviews, key))
);
assert(
  "every customer t(\"…\") key exists in reviews.*",
  missingCustomerKeys.length === 0,
  missingCustomerKeys.join(", ")
);

// Admin page: t("…") -> reviewsAdmin, tReviews("…") -> reviews.
const usedAdminKeys = new Set();
for (const match of adminPage.matchAll(/(?<![A-Za-z])t\("([A-Za-z0-9_.]+)"/g)) {
  usedAdminKeys.add(match[1]);
}
const missingAdminKeys = [...usedAdminKeys].filter(
  (key) => !isNonEmptyString(hasMessage(en.reviewsAdmin, key))
);
assert(
  "every admin page t(\"…\") key exists in reviewsAdmin.*",
  missingAdminKeys.length === 0,
  missingAdminKeys.join(", ")
);

const usedAdminReviewKeys = new Set();
for (const match of adminPage.matchAll(/\btReviews\("([A-Za-z0-9_.]+)"/g)) {
  usedAdminReviewKeys.add(match[1]);
}
const missingAdminReviewKeys = [...usedAdminReviewKeys].filter(
  (key) => !isNonEmptyString(hasMessage(en.reviews, key))
);
assert(
  "every admin tReviews(\"…\") key exists in reviews.*",
  missingAdminReviewKeys.length === 0,
  missingAdminReviewKeys.join(", ")
);

const usedControlKeys = new Set();
for (const match of adminControl.matchAll(/\bt\("([A-Za-z0-9_.]+)"/g)) {
  usedControlKeys.add(match[1]);
}
const missingControlKeys = [...usedControlKeys].filter(
  (key) => !isNonEmptyString(hasMessage(en.reviewsAdmin, key))
);
assert(
  "every moderation-control t(\"…\") key exists in reviewsAdmin.*",
  missingControlKeys.length === 0,
  missingControlKeys.join(", ")
);

// Dynamic keys are declared explicitly by the helpers; assert their targets.
for (const key of [
  "sortNewest",
  "sortOldest",
  "sortHighest",
  "sortLowest",
  "errorSignIn",
  "errorRestricted",
  "errorValidation",
  "errorNotEligible",
  "errorDuplicate",
  "errorHiddenReadonly",
  "errorNotFound",
  "errorNotReportable",
  "errorSelfReport",
  "errorAlreadyReported",
  "errorUnavailable",
  "errorSubmit",
  "reasonSpam",
  "reasonAbuse",
  "reasonHarassment",
  "reasonPersonalInformation",
  "reasonIrrelevant",
  "reasonOther",
]) {
  assert(
    `dynamic customer key reviews.${key} exists`,
    isNonEmptyString(hasMessage(en.reviews, key)) &&
      isNonEmptyString(hasMessage(vi.reviews, key))
  );
}

for (const key of [
  "filterOpen",
  "filterResolved",
  "filterDismissed",
  "filterAll",
  "errorSignIn",
  "errorRestricted",
  "errorForbidden",
  "errorValidation",
  "errorNotFound",
  "errorGeneric",
]) {
  assert(
    `dynamic admin key reviewsAdmin.${key} exists`,
    isNonEmptyString(hasMessage(en.reviewsAdmin, key)) &&
      isNonEmptyString(hasMessage(vi.reviewsAdmin, key))
  );
}

// ---------------------------------------------------------------------------
console.log("\n== Summary ==");
// ---------------------------------------------------------------------------
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nReview verification FAILED.");
  process.exit(1);
}

console.log("Review verification PASSED.");
