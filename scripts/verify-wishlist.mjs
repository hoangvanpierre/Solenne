#!/usr/bin/env node
// ===========================================================================
// Solenne — Verification Harness for the Customer Wishlist (0014)
// ===========================================================================
// Statically verifies the wishlist surface end to end:
//   A. Migration 0014 exists and declares the relation, keys and indexes
//   B. RLS is enabled with per-command own-row policies and no FOR ALL policy
//   C. Grants are least-privilege: no anon access, no UPDATE for authenticated
//   D. Every policy carries the public.is_active_account() guard
//   E. The migration ships a self-verification block that raises on failure
//   F. The server actions authorize through requireActiveActor() and never
//      use the service-role client
//   G. Ownership is never taken from client input; only the product id is
//      accepted, and it is validated before any query
//   H. The add path is idempotent (23505 -> success) and both actions
//      revalidate the wishlist surface
//   I. The data layer reads through the user-scoped client only
//   J. UI wiring: shared button, aria contract, one provider per page, no
//      per-card fetch, guests redirected to login
//   K. Localization: en/vi key parity for every wishlist string
//
// Read-only: this harness never touches a database or the network.
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

function readJson(url) {
  return JSON.parse(readSource(url));
}

/**
 * Strips `--` line comments so a comment that *describes* a prohibition (for
 * example "no `for all` policy") cannot satisfy — or defeat — an assertion
 * about the executable DDL.
 */
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const index = line.indexOf("--");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

const MIGRATION = new URL(
  "../supabase/migrations/0014_wishlist.sql",
  import.meta.url
);
const ACTIONS = new URL("../app/actions/wishlist.ts", import.meta.url);
const DATA_LAYER = new URL("../lib/wishlist.ts", import.meta.url);
const CORE = new URL("../lib/wishlist-core.ts", import.meta.url);
const VALIDATION = new URL("../lib/validations/wishlist.ts", import.meta.url);
const PROVIDER = new URL(
  "../components/wishlist/wishlist-provider.tsx",
  import.meta.url
);
const BUTTON = new URL(
  "../components/wishlist/wishlist-button.tsx",
  import.meta.url
);
const ITEM_ROW = new URL(
  "../components/wishlist/wishlist-item-row.tsx",
  import.meta.url
);
const CARD = new URL("../components/product/product-card.tsx", import.meta.url);
const INFO = new URL("../components/product/product-info.tsx", import.meta.url);
const PRODUCTS_PAGE = new URL(
  "../app/(marketing)/products/page.tsx",
  import.meta.url
);
const PRODUCT_PAGE = new URL(
  "../app/(marketing)/products/[slug]/page.tsx",
  import.meta.url
);
const COLLECTION_PAGE = new URL(
  "../app/(marketing)/collections/[slug]/page.tsx",
  import.meta.url
);
const ACCOUNT_PAGE = new URL(
  "../app/(marketing)/account/page.tsx",
  import.meta.url
);
const WISHLIST_PAGE = new URL(
  "../app/(marketing)/account/wishlist/page.tsx",
  import.meta.url
);
const EN = new URL("../messages/en.json", import.meta.url);
const VI = new URL("../messages/vi.json", import.meta.url);

// ---------------------------------------------------------------------------
console.log("== A. Migration 0014 (supabase/migrations/0014_wishlist.sql) ==");
// ---------------------------------------------------------------------------
assert("migration 0014 file exists", fs.existsSync(MIGRATION));

const sql = readSource(MIGRATION);
const ddl = stripSqlComments(sql);

assert(
  "creates public.wishlist_items idempotently",
  ddl.includes("create table if not exists public.wishlist_items")
);
assert(
  "wishlist_items.id is a uuid primary key",
  /id uuid primary key default gen_random_uuid\(\)/i.test(ddl)
);
assert(
  "user_id is NOT NULL and references profiles(id)",
  /user_id uuid not null\s*\n?\s*references public\.profiles\(id\)/i.test(ddl)
);
assert(
  "product_id is NOT NULL and references products(id)",
  /product_id uuid not null\s*\n?\s*references public\.products\(id\)/i.test(ddl)
);
assert(
  "both foreign keys cascade on delete",
  (ddl.match(/on delete cascade/gi) ?? []).length >= 2,
  `found ${(ddl.match(/on delete cascade/gi) ?? []).length}`
);
assert(
  "created_at defaults to now()",
  /created_at timestamptz not null default now\(\)/i.test(ddl)
);
assert(
  "unique (user_id, product_id) drives add idempotency",
  /unique \(user_id, product_id\)/i.test(ddl)
);
assert(
  "indexes the account listing (user_id, created_at desc)",
  /wishlist_items_user_created_idx\s*\n?\s*on public\.wishlist_items \(user_id, created_at desc\)/i.test(
    ddl
  )
);
assert(
  "indexes product_id for the cascade",
  /wishlist_items_product_idx\s*\n?\s*on public\.wishlist_items \(product_id\)/i.test(
    ddl
  )
);

// ---------------------------------------------------------------------------
console.log("\n== B. Row Level Security: per-command own-row policies ==");
// ---------------------------------------------------------------------------
assert(
  "RLS is enabled on wishlist_items",
  ddl.includes("alter table public.wishlist_items enable row level security;")
);

const policies = [...ddl.matchAll(/create policy\s+(\w+)[\s\S]*?;/gi)].map(
  (match) => match[0]
);

assert(
  "declares exactly three policies",
  policies.length === 3,
  `found ${policies.length}`
);
assert(
  "has a SELECT policy scoped to authenticated",
  /for select to authenticated/i.test(ddl)
);
assert(
  "has an INSERT policy scoped to authenticated",
  /for insert to authenticated/i.test(ddl)
);
assert(
  "has a DELETE policy scoped to authenticated",
  /for delete to authenticated/i.test(ddl)
);
assert(
  "no broad FOR ALL policy",
  !policies.some((policy) => /for all/i.test(policy))
);
assert(
  "no UPDATE policy (ownership is immutable)",
  !policies.some((policy) => /for update/i.test(policy))
);
assert(
  "no policy is granted to anon",
  !/create policy[\s\S]{0,200}\bto\s+anon\b/i.test(ddl)
);
assert(
  "every policy checks user_id = auth.uid()",
  policies.filter((policy) => /user_id = auth\.uid\(\)/i.test(policy)).length === 3,
  `${policies.filter((policy) => /user_id = auth\.uid\(\)/i.test(policy)).length}/3`
);

// ---------------------------------------------------------------------------
console.log("\n== C. Least-privilege grants ==");
// ---------------------------------------------------------------------------
assert(
  "anon privileges are revoked",
  /revoke all on table public\.wishlist_items from anon;/i.test(ddl)
);
assert(
  "authenticated privileges are reset before granting",
  /revoke all on table public\.wishlist_items from authenticated;/i.test(ddl)
);
assert(
  "authenticated gets exactly SELECT, INSERT, DELETE",
  /grant select, insert, delete on table public\.wishlist_items to authenticated;/i.test(
    ddl
  )
);
assert(
  "authenticated never receives UPDATE",
  !/grant[^;]*update[^;]*to authenticated/i.test(ddl)
);
assert(
  "authenticated never receives ALL PRIVILEGES",
  !/grant all[^;]*to authenticated/i.test(ddl)
);
assert(
  "service_role keeps a maintenance path",
  /grant select, insert, delete on table public\.wishlist_items to service_role;/i.test(
    ddl
  )
);

// ---------------------------------------------------------------------------
console.log("\n== D. Active-account guard ==");
// ---------------------------------------------------------------------------
assert(
  "depends on public.is_active_account() from migration 0001",
  /public\.is_active_account\(\)/.test(ddl)
);
assert(
  "fails loudly when that helper is missing",
  /requires public\.is_active_account\(\)/.test(sql)
);
assert(
  "all three policies carry the active-account guard",
  policies.filter((policy) => /public\.is_active_account\(\)/.test(policy))
    .length === 3
);

// ---------------------------------------------------------------------------
console.log("\n== E. Self-verification block ==");
// ---------------------------------------------------------------------------
assert("ships a DO $$ verification block", /do \$\$/.test(sql));
assert(
  "verifies the relation exists",
  sql.includes("table public.wishlist_items does not exist")
);
assert(
  "verifies RLS is enabled",
  sql.includes("row level security is not enabled on public.wishlist_items")
);
assert(
  "verifies the unique pair",
  sql.includes("lacks a unique (user_id, product_id) constraint")
);
assert(
  "verifies no FOR ALL policy",
  sql.includes("a broad FOR ALL policy exists on public.wishlist_items")
);
assert(
  "verifies authenticated holds no UPDATE",
  sql.includes("authenticated must not hold UPDATE on public.wishlist_items")
);
assert(
  "verifies anon holds nothing",
  sql.includes("anon unexpectedly holds privileges on public.wishlist_items")
);
assert(
  "prints a success notice",
  sql.includes("--- Solenne 0014 OK:")
);

// ---------------------------------------------------------------------------
console.log("\n== F. Server actions: authorization + client scope ==");
// ---------------------------------------------------------------------------
assert("app/actions/wishlist.ts exists", fs.existsSync(ACTIONS));

const actions = readSource(ACTIONS);

assert(
  "is a server-action module",
  /^"use server";/m.test(actions)
);
assert(
  "exports addToWishlistAction and removeFromWishlistAction",
  /export async function addToWishlistAction/.test(actions) &&
    /export async function removeFromWishlistAction/.test(actions)
);
assert(
  "authorizes through requireActiveActor()",
  /requireActiveActor\(\)/.test(actions)
);
assert(
  "does not import the service-role client",
  !/supabase\/admin/.test(actions) &&
    !/createAdminClient/.test(actions) &&
    !/SUPABASE_SECRET_KEY/.test(actions)
);
assert(
  "uses the user-scoped server client",
  /from "@\/lib\/supabase\/server"/.test(actions)
);
assert(
  "derives ownership from the verified actor",
  /actor\.userId/.test(actions)
);
assert(
  "never reads a user id from the payload",
  !/input\.userId|input\.user_id|body\.userId|body\.user_id/.test(actions)
);

// ---------------------------------------------------------------------------
console.log("\n== G. Product id validation + idempotency ==");
// ---------------------------------------------------------------------------
assert("lib/wishlist-core.ts exists", fs.existsSync(CORE));
assert("lib/validations/wishlist.ts exists", fs.existsSync(VALIDATION));

const validation = readSource(VALIDATION);

assert(
  "the shared validator is used by the schema",
  /isWishlistProductId/.test(validation)
);
assert(
  "the actions validate the product id before querying",
  /parseWishlistProductId/.test(actions)
);
assert(
  "an invalid id returns the validation code",
  /code: "validation"/.test(actions)
);
assert(
  "duplicate saves are treated as success via 23505",
  /isDuplicateWishlistError/.test(actions)
);
assert(
  "the insert payload carries only user_id + product_id",
  /\.insert\(\{ user_id: actor\.userId, product_id: productId \}\)/.test(actions)
);
assert(
  "the product must exist and be active before saving",
  /is_active/.test(actions) && /product_unavailable/.test(actions)
);
assert(
  "both actions revalidate the wishlist surface",
  (actions.match(/revalidatePath\("\/account\/wishlist"\)/g) ?? []).length === 1 &&
    /function revalidateWishlist/.test(actions)
);
assert(
  "a failed delete is surfaced, not swallowed",
  /if \(deleteError\) \{/.test(actions) && /persist_failed/.test(actions)
);

// ---------------------------------------------------------------------------
console.log("\n== H. Data layer: user-scoped reads only ==");
// ---------------------------------------------------------------------------
assert("lib/wishlist.ts exists", fs.existsSync(DATA_LAYER));

const dataLayer = readSource(DATA_LAYER);

assert(
  "reads through the user-scoped client",
  /from "@\/lib\/supabase\/server"/.test(dataLayer)
);
assert(
  "does not import the service-role client",
  !/supabase\/admin/.test(dataLayer) && !/createAdminClient/.test(dataLayer)
);
assert(
  "guests cost no query (guest-safe reader)",
  /getWishlistProductIdsForViewer/.test(dataLayer) &&
    /actor\.status !== "active"/.test(dataLayer)
);
assert(
  "the strict reader enforces an active actor",
  /requireActiveActor\(\)/.test(dataLayer)
);
assert(
  "fetches products in one batched call (no N+1)",
  /getProductsByIds/.test(dataLayer)
);

// ---------------------------------------------------------------------------
console.log("\n== I. UI wiring and accessible contract ==");
// ---------------------------------------------------------------------------
for (const [label, url] of [
  ["wishlist-provider.tsx", PROVIDER],
  ["wishlist-button.tsx", BUTTON],
  ["wishlist-item-row.tsx", ITEM_ROW],
  ["product-card.tsx", CARD],
  ["product-info.tsx", INFO],
  ["account/wishlist/page.tsx", WISHLIST_PAGE],
]) {
  assert(`${label} exists`, fs.existsSync(url));
}

const button = readSource(BUTTON);
const provider = readSource(PROVIDER);
const card = readSource(CARD);
const info = readSource(INFO);
const itemRow = readSource(ITEM_ROW);
const wishlistPage = readSource(WISHLIST_PAGE);

assert(
  "the shared button exposes aria-pressed",
  /aria-pressed=\{saved\}/.test(button)
);
assert(
  "the shared button exposes a product-specific aria-label",
  /aria-label=\{label\}/.test(button) && /t\("removeLabel", \{ name: productName \}\)/.test(button)
);
assert(
  "the shared button exposes its pending state",
  /aria-busy=\{pending \|\| undefined\}/.test(button)
);
assert(
  "the shared button supports icon and full variants",
  /variant === "full"/.test(button)
);
assert(
  "the card uses the shared wishlist button",
  /<WishlistButton/.test(card) && !/from "lucide-react"/.test(card)
);
assert(
  "the detail page uses the full wishlist button",
  /variant="full"/.test(info) && /<WishlistButton/.test(info)
);
assert(
  "the provider hydrates from server-rendered ids",
  /initialIds/.test(provider)
);
assert(
  "optimistic updates roll back only the affected product",
  /applyWishlistToggle\(idsRef\.current, productId, !nextSaved\)/.test(provider)
);
assert(
  "a guest click never reaches the database",
  /authState === "anonymous"[\s\S]{0,120}wishlistLoginHref/.test(provider)
);
assert(
  "a restricted account gets a localized error",
  /authState === "restricted"[\s\S]{0,80}errorRestricted/.test(provider)
);
assert(
  "the provider announces saves to screen readers",
  /role="status"/.test(provider) && /aria-live="polite"/.test(provider)
);
assert(
  "failures surface as a live alert",
  /role="alert"/.test(provider)
);
assert(
  "the wishlist row removes through the shared store",
  /remove\(product\.id\)/.test(itemRow) && /aria-label=/.test(itemRow)
);

for (const [label, url] of [
  ["/products", PRODUCTS_PAGE],
  ["/collections/[slug]", COLLECTION_PAGE],
  ["/products/[slug]", PRODUCT_PAGE],
]) {
  const page = readSource(url);
  assert(
    `${label} hydrates one provider from the server`,
    /<WishlistProvider initialIds=\{wishlistIds\}>/.test(page) &&
      /getWishlistProductIdsForViewer/.test(page)
  );
}

assert(
  "the account dashboard links to the wishlist",
  /href="\/account\/wishlist"/.test(readSource(ACCOUNT_PAGE))
);
assert(
  "the wishlist page redirects guests to login with a safe next",
  /\/login\?next=\$\{encodeURIComponent\(/.test(wishlistPage) &&
    /if \(!user\) \{\s*\n\s*redirect\(WISHLIST_LOGIN_HREF\)/.test(wishlistPage)
);
assert(
  "the wishlist page handles restricted and failing accounts",
  /isRestrictedAuthError/.test(wishlistPage) &&
    /isUnauthenticatedAuthError/.test(wishlistPage)
);
assert(
  "the wishlist page renders a polished empty state",
  /emptyTitle/.test(wishlistPage) && /emptyCta/.test(wishlistPage)
);

// No product card may issue its own wishlist request.
assert(
  "product cards contain no direct wishlist query",
  !/wishlist_items/.test(card) && !/addToWishlistAction/.test(card)
);

// ---------------------------------------------------------------------------
console.log("\n== J. Localization: en/vi parity ==");
// ---------------------------------------------------------------------------
const en = readJson(EN);
const vi = readJson(VI);

const REQUIRED_KEYS = [
  "title",
  "subtitle",
  "backToAccount",
  "viewWishlist",
  "addCta",
  "savedCta",
  "addLabel",
  "removeLabel",
  "removeAction",
  "emptyTitle",
  "emptyDescription",
  "emptyCta",
  "loadError",
  "contactUs",
  "actionError",
  "errorSignIn",
  "errorRestricted",
  "errorUnavailable",
  "announcementSaved",
  "announcementRemoved",
  "dismiss",
];

assert("messages/en.json has a wishlist block", Boolean(en.wishlist));
assert("messages/vi.json has a wishlist block", Boolean(vi.wishlist));

const enKeys = Object.keys(en.wishlist ?? {}).sort();
const viKeys = Object.keys(vi.wishlist ?? {}).sort();

assert(
  "en and vi expose the same wishlist keys",
  enKeys.length === viKeys.length &&
    enKeys.every((key, index) => key === viKeys[index]),
  `en=${enKeys.length} vi=${viKeys.length}`
);

for (const key of REQUIRED_KEYS) {
  assert(`wishlist.${key} is translated in both locales`, 
    typeof en.wishlist?.[key] === "string" &&
      en.wishlist[key].trim().length > 0 &&
      typeof vi.wishlist?.[key] === "string" &&
      vi.wishlist[key].trim().length > 0
  );
}

assert(
  "the accessible labels interpolate the product name",
  /\{name\}/.test(en.wishlist.addLabel) && /\{name\}/.test(vi.wishlist.addLabel) &&
    /\{name\}/.test(en.wishlist.removeLabel) && /\{name\}/.test(vi.wishlist.removeLabel)
);
assert(
  "the two locales actually differ (not copy-pasted English)",
  en.wishlist.title !== vi.wishlist.title
);

// Every key the UI asks for must exist in the catalogue.
const usedKeys = new Set();
for (const source of [provider, button, itemRow, wishlistPage]) {
  for (const match of source.matchAll(/t\("([A-Za-z0-9_]+)"/g)) {
    usedKeys.add(match[1]);
  }
}
const missingKeys = [...usedKeys].filter((key) => !en.wishlist?.[key]);
assert(
  "every t(\"…\") key used by the UI exists in messages/en.json",
  missingKeys.length === 0,
  missingKeys.join(", ")
);

// ---------------------------------------------------------------------------
console.log("\n== Summary ==");
// ---------------------------------------------------------------------------
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nWishlist verification FAILED.");
  process.exit(1);
}

console.log("Wishlist verification PASSED.");
