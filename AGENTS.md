<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Solenne — Agent Guide

Solenne is a luxury artisan scented-candle e-commerce storefront built with Next.js 16 (App Router), React 19, Tailwind CSS v4, and Supabase. The codebase is in an early "v0.1" stage: journal content and marketing copy are static placeholders and online payment is not yet wired (orders are placed as "pending payment"; Stripe deps installed but unused). Product photography **is** wired — the catalog renders real assets through a build-time AVIF/WebP pipeline.

## Commands

Package manager is **pnpm** (see `pnpm-workspace.yaml`). Scripts defined in `package.json`:

| Command | Script | Notes |
| --- | --- | --- |
| `pnpm dev` | `next dev` | Starts dev server on :3000. Re-regenerates the `BEGIN:nextjs-agent-rules` block at the top of this file. |
| `pnpm build` | `node scripts/generate-optimized-images.mjs && next build` | Regenerates the 36 AVIF/WebP variants in `public/images/product/optimized/` **before** building. ⚠️ **Not a "generally safe" verification command** — it invokes the product-image generator, so only run it when you actually intend a build. The generator is deterministic (a re-run produces no diff against the committed files), but it still executes and rewrites the optimized output. |
| `pnpm start` | `next start` | Serve the production build. |
| `pnpm lint` | `eslint` | ESLint flat config (`eslint.config.mjs`) using `eslint-config-next` core-web-vitals + TS presets. Note: runs `eslint` with no path arg — relies on config defaults. |
| `pnpm generate:images` | `node scripts/generate-optimized-images.mjs` | Regenerates the optimized product variants on their own. |
| `pnpm build:worker` | `opennextjs-cloudflare build` | OpenNext/Cloudflare worker build. OpenNext runs `pnpm build` internally, so the image generator and `next build` each run exactly once — do **not** add the generator here. No Cloudflare token/account needed, nothing is deployed. ⚠️ Currently fails at OpenNext's server bundling because esbuild inlines `sharp`'s native addon (see Gotchas; upstream fix not yet released). ⚠️ Same product-image caution as `pnpm build`. |
| `pnpm preview` | `opennextjs-cloudflare build && opennextjs-cloudflare preview` | Local worker preview. ⚠️ Runs a worker build (and therefore the image generator) — treat it like `build:worker`, not as a lightweight verification step. |
| `pnpm deploy` | `opennextjs-cloudflare build && opennextjs-cloudflare deploy` | Deploys to Cloudflare Workers. **Deployment state is currently UNVERIFIED** — see the Gotchas section. |
| `pnpm upload` | `opennextjs-cloudflare build && opennextjs-cloudflare upload` | Uploads a worker version without promoting it. |
| `pnpm cf-typegen` | `wrangler types ...` | Regenerates `cloudflare-env.d.ts` from the Worker bindings. |
| `pnpm typecheck` | `tsc --noEmit` | Type checks application code, tests and config. |
| `pnpm test` | `pnpm test:unit && pnpm test:verify` | The local half of the CI gate. |
| `pnpm test:unit` | `node --test "tests/unit/**/*.test.ts"` | Node's built-in test runner with TypeScript type stripping. No framework dependency. |
| `pnpm test:verify` | `node scripts/run-verify.mjs` | Only the deterministic harnesses approved for CI (11 of 13). |
| `pnpm test:e2e` | `playwright test` | Requires `SOLENNE_E2E_BASE_URL` (staging, or a local server; never production). The 5 database-free public-shell tests run in PR CI; staging journeys do not. Install the browser once: `pnpm exec playwright install chromium`. |

There is **no formatter configured**, and unit tests use Node's built-in runner rather than a framework — do not add one unless asked. `docs/quality/production-readiness.md` documents the CI gate, the unit/E2E test inventory, and what is still untested.

There are also **static verification harnesses** in `scripts/` — plain Node scripts (no test framework) that assert invariants over the SQL migrations, Zod schemas, and source code. Run them directly, e.g. `node scripts/verify-customer-status.mjs`. Each prints `[PASS]`/`[FAIL]` lines and a summary; the exit code is non-zero on failure. 13 exist: `verify-admin-assistant`, `verify-admin-shell`, `verify-callback-redirect`, `verify-cancel-order`, `verify-contact-newsletter`, `verify-customer-status`, `verify-dock-layout`, `verify-fulfillment-transitions`, `verify-inventory-adjustment`, `verify-post-login-routing`, `verify-product-management`, `verify-rbac`, `verify-search`. `pnpm test:verify` runs the 11 that are safe in CI; `verify-rbac` (live Supabase) and `verify-dock-layout` (Puppeteer) stay manual.

## Architecture & Data Flow

### Routing (App Router with route groups)

```
app/
  layout.tsx            # Root layout: <html>/<body>, font (Cactus Classical Serif), metadata
  globals.css           # Tailwind v4 theme (CSS variables + @theme inline), keyframes, utilities
  (marketing)/          # Route group — shares one marketing layout, no URL prefix
    layout.tsx          # "use client" — wraps every marketing page in SmoothScroll + Navbar + MobileNav + CartDrawer + Footer + BackToTop
    page.tsx            # Home — Hero (eager) + 6 section components dynamically imported (ssr: true)
    products/
      page.tsx          # Product listing — queries getProducts() from Supabase via lib/products.ts
      [slug]/page.tsx   # Product detail — async Server Component, queries getProductBySlug() from Supabase
    collections/        # Scent families: page.tsx + [slug]/page.tsx
    account/            # Account hub (auth-gated): page.tsx, orders/, address/, profile/
    checkout/           # Checkout — auth-gated; server page prefills contact info, renders CheckoutForm (client)
      success/page.tsx  # Order confirmation/receipt — reads ?number=<orderNumber>, shows "pending payment" status
    about/ contact/ faq/ journal/ shipping/ care-guide/   # Static content routes
  (auth)/               # Route group — auth pages share a minimal layout (no site chrome)
    layout.tsx
    login/ register/ forgot-password/ reset-password/
  auth/callback/route.ts  # OAuth / PKCE callback → resolvePostLoginPath()
  admin/                # Back-office (outside the (marketing) layout — no Navbar/Footer/SmoothScroll)
    layout.tsx          # Server boundary; requireActiveActor() + requireAnyPermission(MANAGEMENT_PERMISSIONS)
    page.tsx            # Admin dashboard
    audit/              # Audit log viewer (Module A4)
    customers/          # Customer directory (Module B1)
      [id]/page.tsx     # Customer detail + CustomerStatusControl (Module B2)
    inventory/          # Inventory management + adjustments (Module A3)
    orders/             # Order management, cancellation, fulfillment (Modules A1/A2)
      [id]/page.tsx
    products/           # Product catalog management
      new/page.tsx
      [id]/page.tsx
  actions/              # Server Actions ("use server"): auth, products, orders, inventory, customers, profile, locale, ...
```

Key points:
- The `(marketing)` route group's layout is a **Client Component** (`"use client"`), so every marketing page renders inside a client boundary. `MobileNav` and `CartDrawer` are `dynamic(..., { ssr: false })` imports within it.
- Home page uses `dynamic()` with `ssr: true` for below-the-fold sections to keep the initial JS bundle small while still server-rendering HTML.
- Dynamic route params in Next 16 are **async** — `params: Promise<{ slug: string }>` must be awaited (see `app/(marketing)/products/[slug]/page.tsx`).
- Auth routes (`/login`, `/register`, `/forgot-password`, `/reset-password`) and `/account` are implemented. All routes referenced in `lib/constants.ts` (`NAV_LINKS`, `FOOTER_LINKS`) exist: `/collections` (scent-family listing + `/collections/[slug]`, where a slug matches a `SCENT_CATEGORIES` id or `gift-sets`), `/about` (with `#craft`/`#ingredients`/`#sustainability` anchors), `/journal` (static posts from `lib/journal.ts` + SSG `/journal/[slug]`), `/contact` (client `ContactForm` in `components/sections/contact-form.tsx` → `submitContactAction` in `app/actions/contact.ts`, which inserts into `contact_messages` via the admin client; the Newsletter section does the same for `newsletter_subscribers`), `/faq`, `/shipping`, and `/care-guide`.

### Middleware & Supabase Auth

`middleware.ts` → `lib/supabase/middleware.ts` runs on every matched request (excludes `_next/static`, `_next/image`, `favicon.ico`, and common image extensions). It:
- Creates a Supabase server client bound to the request/response cookies.
- Calls `supabase.auth.getUser()` to refresh the session (do **not** insert logic between `createServerClient` and `getUser()` — see the comment in that file; it causes hard-to-debug random logouts).
- **Fast-path**: if the request carries no Supabase auth cookie (`sb-*-auth-token`), it skips the remote `getUser()` round-trip entirely. Protected paths are still redirected to `/login?next=…`; everything else passes straight through.
- **Route protection** is centralized in `lib/supabase/middleware.ts` via `PROTECTED_ROUTE_SEGMENTS = ["/admin", "/account", "/checkout"]` and the exported `isProtectedPath(pathname)` helper. It matches an exact root path or a child path segment, so `/admin` and `/admin/orders` are protected while `/administrator`, `/accounting`, and `/checkout-help` are **not** false-positived. Do not add ad-hoc prefix checks elsewhere — use `isProtectedPath()`.
- Redirects unauthenticated users from protected paths → `/login` (preserving the original target in `?next=`), and logged-in users from `/login`/`/register` → the role-aware destination from `resolvePostLoginPath()` (see `lib/redirect.ts`).

### Supabase client pattern

Three client factory files, all using `@supabase/ssr`:
- `lib/supabase/client.ts` — browser client (`createBrowserClient`), for Client Components.
- `lib/supabase/server.ts` — server client (`createServerClient` + `next/headers` cookies), for Server Components and Route Handlers.
- `lib/supabase/middleware.ts` — edge/middleware client with manual cookie forwarding.

Env vars (all in `.env.local`, **gitignored**): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`. Note the **new-style Supabase keys** (`sb_publishable_…`, `sb_secret_…`) — not the legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.

A `@supabase/server` skill is installed at `.agents/skills/supabase-server/SKILL.md` (tracked via `skills-lock.json`). **Load that skill before writing any Edge Function or server-side code that uses `@supabase/server`** (e.g. `withSupabase`, `auth:` modes, Stripe webhooks). The skill documents breaking changes: `auth:` (not `allow`), mode values `'none'`/`'publishable'` (not `'always'`/`'public'`), and the `authMode` field rename.

### State management (Zustand)

Three stores in `stores/`:
- `cart-store.ts` — persisted to `localStorage` under key `"solenne-cart"` via `persist` + `partialize` (only `items` are persisted, not `isCartOpen`). `addItem` auto-opens the cart. Quantity ≤ 0 removes the item.
- `filter-store.ts` — ephemeral product filter state (category, priceRange, sortBy, search). Not persisted.
- `ui-store.ts` — ephemeral UI state (mobile nav, search, currency `'VND'|'USD'`, locale `'en'|'vi'`). Not persisted.

The `useCart` hook (`hooks/use-cart.ts`) wraps `useCartStore` and derives `itemCount`, `subtotal`, `shippingFee`, and `total` with `useMemo`. It reads `currency` from `useUIStore` and computes amounts in the display currency: when VND, subtotal/total are converted via the fixed `USD_TO_VND` rate (`lib/constants.ts`) because product prices are stored USD-only, and shipping uses the VND thresholds. It also exposes a `format(amountUSD)` helper; the cart drawer uses it for all price rendering.

### Data layer (Supabase)

Products and variants are stored in Supabase PostgreSQL (`products`, `product_variants` tables) and accessed via helper functions in `lib/products.ts` (`getProducts`, `getProductsByCategory`, `getProductBySlug`, `getFeaturedProducts`), which query with `createClient` from `@/lib/supabase/server` and map database fields to `Product` and `ProductVariant` models. A re-runnable seed script is available at `scripts/seed-products.mjs`.

### Orders

Orders live in the `orders` and `order_items` tables. The flow: CartDrawer "Checkout" → `/checkout` (login required, enforced by middleware + page-level `getUser` check) → `CheckoutForm` (client, `components/checkout/checkout-form.tsx`) → `createOrderAction` (`app/actions/orders.ts`) → `createOrder` in `lib/orders.ts`, which:
- Re-verifies the session server-side (userId always comes from `auth.getUser()`, never from client input).
- Recomputes all prices server-side from `product_variants` (client-sent cart items are only `{variantId, quantity}`), applies `SHIPPING` USD thresholds, and stores totals in **USD**.
- Inserts `orders` + `order_items` via the secret-key admin client (`lib/supabase/admin.ts`), decrements stock with an optimistic-concurrency guard, and generates `SLN-<base36>-<random>` order numbers.
- Sets status `"pending"` (displayed as "Pending Payment") — payment integration (Stripe) is not yet built; `stripe_session_id`/`stripe_payment_intent` columns are ready for it.
On success the client clears the cart and redirects to `/checkout/success?number=<orderNumber>`. The account page lists order history via `getOrdersForUser`.

**Order history UI** (`components/account/`): the account dashboard is an editorial layout — header ("Account" + tagline), a 60/40 two-column main section (`lg:grid-cols-5`, `lg:col-span-3`/`lg:col-span-2`) with Order History (compact `divide-y` rows, no mini-cards; 3 most recent, `countOrdersForUser` supplies the total for the "View all orders (N) →" link shown only when there are more than 3) beside Shipping Sanctuary (saved address + "Edit address →"), then a full-width Bespoke Profile settings panel (Scent Preferences / Currency / Account Details + "Manage profile →"). The Order History card is an async `OrderHistoryCard` inside `<Suspense>` (skeleton fallback). The full history lives at `/account/orders` (auth-protected by middleware; still uses bordered `OrderListItem`). States handled everywhere: empty, partial/full lists, loading (Suspense skeletons), and error (try/catch → friendly message).

**Account management pages**: `/account/address` (edit the default address via `AddressForm` → `updateAddressAction` → `saveDefaultAddress`) and `/account/profile` (name/phone via `ProfileForm` → `updateProfileAction` → admin-client `profiles` upsert). Schemas live in `lib/validations/account.ts`. These are the targets of the dashboard's "Edit address →" / "Manage profile →" actions.

**Saved addresses** (`lib/addresses.ts`, backed by the `addresses` table): `createOrder` also saves the checkout shipping address as the user's single **default** address (best-effort — never fails the order). The `/checkout` page prefills the form from it (plus `profiles.full_name`/`phone`), and the account page's "Shipping Sanctuary" card displays it. The table has no full-name/phone columns, so those always come from the profile.

### Contact & newsletter tables — **migration `0013` applied to production; do not re-run it**

`app/actions/contact.ts` (`submitContactAction`) and `app/actions/newsletter.ts` (`subscribeNewsletterAction`) insert into `contact_messages` and `newsletter_subscribers` via the secret-key admin client. The DDL for both tables is the numbered migration **`supabase/migrations/0013_contact_newsletter_tables.sql`**. The older `scripts/schema-newsletter-contact.sql` is a **superseded pointer, not an instruction** — it contains no DDL at all, only a warning that `0013` is already applied and must not be re-run. It used to be the canonical script, and it used to grant broad `INSERT` to `anon`/`authenticated` with `WITH CHECK (true)`; `0013` tightens this to `service_role` only.

**Both relations now exist in production.** When first audited (against the live PostgREST OpenAPI spec on 2026-10-20) the `definitions` block held exactly 11 relations — `order_outbox_events`, `role_permissions`, `orders`, `audit_logs`, `order_items`, `products`, `roles`, `profiles`, `addresses`, `product_variants`, `permissions` — and `contact_messages` / `newsletter_subscribers` were absent. `0013` has since been applied to production by hand, so both are now live, RLS-protected relations and both currently hold rows.

State of the code today:

- Both actions **no longer swallow insert errors**. On a failed insert they return `{ code: "persist_failed", error: ... }`; on success they return `{ success: true }`. The duplicate-subscription path (`error.code === "23505"`) is the one legitimate success branch: `{ success: true, code: "already_subscribed" }`.
- Validation failures return `{ code: "validation", ... }`.
- The UI maps `code` onto localized copy from `messages/en.json` / `messages/vi.json` (`contact.errorServer`, `contact.errorValidation`, `contact.errorUnexpected`, `newsletter.errorEmail`, `newsletter.errorPersist`, `newsletter.successDuplicate`) instead of rendering the English `error` string, so failure text stays bilingual.
- **`0013` is applied, so both features genuinely persist.** Manual testing confirmed a contact submission in `contact_messages` and a subscription in `newsletter_subscribers`, plus the newsletter's unique-email constraint and the localized duplicate-subscription message. The honest-failure path is still in place: if an insert ever fails, the visitor gets a localized error rather than a false "sent" confirmation.

**`0013` has already been applied to production — do NOT run or reapply it.** It was pasted into the Supabase SQL editor by hand (there is no migration runner in this repo); its trailing `DO $$ … $$` block `RAISE EXCEPTION`s if the end state is wrong and printed `--- Solenne 0013 OK: …` when it passed. Note that `node scripts/verify-contact-newsletter.mjs` only checks the migration file's *contents* statically — it cannot tell you whether the file has been run, so do not re-run `0013` as a way of "verifying" anything.

### Database migrations & RPCs

`supabase/migrations/` holds **13** migrations, `0001`–`0013`. **All 13 are applied to the live database** — `0001`–`0012` verified against the live schema on 2026-10-20, and `0013_contact_newsletter_tables.sql` applied manually to production afterwards. They are plain `.sql` files run via the Supabase SQL editor — there is **no migration runner script** in the repo, so applying a new one is a manual, out-of-band step.

**Never re-run an already-applied migration** (`0013` included) as a way of "verifying" anything. Any future schema change must be authored as a **new** migration beginning with **`0014`**, reviewed, and applied manually via the Supabase SQL editor **only when explicitly authorized**.

| Migration | Purpose |
| --- | --- |
| `0001_rbac_schema.sql` | Creates `roles`, `permissions`, `role_permissions`, `audit_logs`; alters the pre-existing `profiles` table with nullable role/status columns; adds the helper functions (`has_permission`, `has_role`, `has_min_role_rank`, `current_actor`, `is_active_account`, `handle_new_user`, `guard_profile_privileges`, …). Every helper is `SECURITY DEFINER` and **must be applied as the project owner (`postgres`)** — the owner bypasses RLS, which is what stops a `profiles` policy calling `has_permission()` from recursing into `profiles`. |
| `0002_rbac_seed.sql` | Seeds the four roles, the explicit permission catalogue, and the role→permission matrix |
| `0003_rbac_rls.sql` | RLS policies across the RBAC tables |
| `0004_bootstrap_admin.sql` | First-admin bootstrap path |
| `0005_rbac_security_foundation.sql` | Hardens `has_permission()` and the RBAC security model |
| `0006_cancel_order_atomic.sql` | `cancel_order` — atomic order cancellation |
| `0007_order_fulfillment_transitions.sql` | `update_order_status` — guarded order status transitions (fulfillment). Also creates `public.order_outbox_events` (`create table if not exists`). |
| `0008_cancel_order_outbox_event.sql` | Replaces `cancel_order` to also emit an outbox event (into the `order_outbox_events` table created by `0007`) |
| `0009_inventory_adjust_atomic.sql` | `adjust_inventory_stock` — atomic stock adjustment |
| `0010_customer_metrics_rpcs.sql` | `customer_role_id`, `get_customer_purchase_metrics` — customer metrics/count RPCs for the admin directory |
| `0011_manage_customer_status_atomic.sql` | `manage_customer_status` — atomic, permission-checked status change + audit row |
| `0012_reinstate_banned_customer_atomic.sql` | `reinstate_banned_customer` — atomic reinstatement of a banned customer + audit row |
| `0013_contact_newsletter_tables.sql` | Creates `public.contact_messages` and `public.newsletter_subscribers`. RLS enabled; `anon`/`authenticated` privileges revoked, `service_role` only; ends with a self-verifying `DO $$` block. **Applied to production — do not re-run.** |

#### Live RPC inventory (19 RPCs — verified 2026-10-20 against the live PostgREST OpenAPI spec)

The live schema is the **source of truth** for RPC signatures — query `GET /rest/v1/` with the secret key and read `paths["/rpc/<name>"]`. `*` marks a **required** parameter.

| RPC | Parameters | Notes |
| --- | --- | --- |
| `adjust_inventory_stock` | `p_variant_id uuid*`, `p_delta integer*`, `p_reason text*` | Atomic stock adjustment; all three required. |
| `cancel_order` | `p_order_id uuid*`, `p_reason text` | `p_reason` optional. Emits an outbox event (migration `0008`). |
| `count_active_admins` | — | Last-admin lockout guard. |
| `current_actor` | — | Returns the caller's actor context (user_id, role, status, permissions). Used by `lib/authz.ts` and the middleware. |
| `current_role_name` | — | Current caller's role name. |
| `current_role_rank` | — | Current caller's role rank. |
| `customer_role_id` | — | Minimal `SECURITY DEFINER` helper returning the customer role UUID (`0010`). |
| `default_role_id` | — | Default role for newly created profiles. |
| `get_customer_purchase_metrics` | `p_user_ids uuid[]*` | Batch customer metrics for the admin directory. |
| `has_min_role_rank` | `p_rank integer*` | Rank-based authorization helper. |
| `has_permission` | `p_key text*` | Permission check by explicit key (no wildcards). |
| `has_role` | `p_name text*` | Role-name check helper. |
| `is_active_account` | — | Account-status check used by the profile guard. |
| `manage_customer_status` | `p_customer_id uuid*`, `p_target_status text*`, `p_reason text*` | All three required. `banned` is terminal here. |
| `reinstate_banned_customer` | `p_customer_id uuid*`, `p_reason text*` | Both required. `EXECUTE` revoked from `service_role` by design. |
| `requesting_role` | — | DB role of the current request (`service_role`, `postgres`, …); used by the guard triggers. |
| `rls_auto_enable` | — | Helper that turns RLS on for a table; **not defined in the repo migrations** (Supabase-managed / out-of-band). Treat as read-only infrastructure. |
| `role_id_by_name` | `p_name text*` | Role-name → UUID lookup. `SECURITY INVOKER`. |
| `update_order_status` | `p_order_id uuid*`, `p_target_status text*`, `p_reason text`, `p_tracking_code text` | Only `p_order_id` + `p_target_status` are required. **`p_tracking_code` is a real live parameter** (added by migration `0007`) — it stores the courier tracking code on the `shipped` transition. Do not omit it from documentation or from `app/actions/orders.ts`. |

Notes:
- The live list is **19 RPCs**; the repo migrations only define a subset. Anything not in `supabase/migrations/*.sql` (notably `rls_auto_enable`) was created out-of-band in the Supabase console and must not be dropped.
- `update_order_status` also accepts `p_reason`; `cancel_order` and `update_order_status` are the only two with a *text* reason, and neither requires it.

#### Live table inventory (11 relations — verified 2026-10-20)

Read from the `definitions` block of the live PostgREST OpenAPI spec (`GET /rest/v1/` with the secret key):

| Relation | Created by | Notes |
| --- | --- | --- |
| `orders` | pre-existing | Order records; totals stored in **USD**. |
| `order_items` | pre-existing | Line items. Its `INSERT` policy rejects `authenticated` writes — see Gotchas. |
| `order_outbox_events` | migration `0007` | Durable notification outbox; written by `cancel_order` (`0008`). |
| `products` | pre-existing | Catalog; 6 live rows, each with exactly one image. |
| `product_variants` | pre-existing | Size/price variants; stock is decremented with an optimistic-concurrency guard. |
| `profiles` | pre-existing (altered by `0001`) | Role/status columns added by `0001`; `status` is writable only through the RPCs. |
| `addresses` | pre-existing | Default shipping address per user; no full-name/phone columns. |
| `roles` | migration `0001`/`0002` | 4 system roles: `customer` (10), `staff` (20), `manager` (30), `admin` (40). |
| `permissions` | migration `0001`/`0002` | 21 explicit permission keys — no wildcards. |
| `role_permissions` | migration `0001`/`0002` | Role → permission matrix. |
| `audit_logs` | migration `0001` | 71 rows across 8 distinct actions as of 2026-10-20. |

**Now present live:** `contact_messages` and `newsletter_subscribers` — migration `0013` **has been applied** to production, so the 11-relation count above predates it; see "Contact & newsletter tables" above.

Key conventions in the atomic RPCs (`0011`, `0012`):
- `SECURITY DEFINER` with a **hardened `search_path`** (`''`, empty string) — never leave the default `search_path` on a definer function.
- The function **re-checks the caller's permission inside the transaction**; do not rely on the server action's pre-check alone.
- **Self-modification is forbidden** (`SELF_STATUS_CHANGE_FORBIDDEN` / `SELF_REINSTATEMENT_FORBIDDEN`).
- `banned` is **terminal** for `manage_customer_status` (`BANNED_STATUS_TERMINAL`); reversal goes through the dedicated `reinstate_banned_customer` RPC.
- `pending` accounts cannot be transitioned (`PENDING_STATUS_UNSUPPORTED`).
- The `authenticated` role must **not** hold `UPDATE` on `profiles.status` — the status column is writable only through the RPCs.
- Every migration ends with a **verification block** that `RAISE EXCEPTION`s if the expected privileges are wrong, so a partially-applied migration fails loudly.

## Conventions

### File organization

```
components/
  ui/           # Primitives: Button, Input, Badge, Skeleton, Separator, Container, IconButton, BackToTop, Combobox — each barrel-exported via index.ts
  product/      # Product-domain components (card, grid, gallery, info, picture, selectors, scent-notes)
  layout/       # Site chrome: Navbar, MobileNav, CartDrawer, Footer, BrandLogo, LocaleToggle, CurrencyToggle, I18nProvider
  sections/     # Marketing page sections (Hero, BrandStory, FeaturedProducts, CraftSection, ScentExplorer, ScentCanvas, Testimonials, Newsletter, ContactForm)
  animations/   # Motion primitives (SmoothScroll, ScrollReveal, TextReveal, TextFillAnimation, ParallaxImage, HorizontalScroll, PinnedSection, MagneticButton)
  account/      # Account hub UI: OrderHistoryCard, OrderListItem, AddressForm, ProfileForm, StatusBadge, RestrictedAccountNotice
  admin/        # Back-office UI: order/customer/product/inventory/audit panels and tables
  auth/         # PasswordStrengthMeter only — the only component folder WITHOUT a barrel
  address/      # Address form primitives shared by checkout + account (shipping-address-fields)
  checkout/     # CheckoutForm and checkout step components
hooks/          # Custom hooks (use-cart, use-locked-body, use-intersection, use-media-query, use-authz, use-locale, use-locale-scroll-restoration, use-same-page-reload)
stores/         # Zustand stores (cart-store, filter-store, ui-store)
lib/            # utils.ts (cn, formatPrice, slugify, ...), constants.ts, products.ts, journal.ts, addresses.ts, inventory.ts, orders.ts, authz.ts, authz-ux.ts, redirect.ts, audit.ts, audit-utils.ts, admin-*.ts, product-images.ts, locale-scroll-restoration.ts, supabase/, validations/
types/          # TypeScript interfaces; index.ts re-exports all
```

Every component directory **except `components/auth/`** has an `index.ts` barrel (`components/auth/` holds a single file and is imported directly). **Import from the barrel, not deep paths** — e.g. `import { Button } from "@/components/ui"` and `import { ProductCard, ProductGrid } from "@/components/product"`. The `@/*` path alias maps to the repo root (`tsconfig.json` paths).

### Component style

- **Client components** are marked with a leading `"use client";` directive at column 0. Server Components (pages, root layout) have none.
- Components are **named function exports**, not default exports, except page/layout files (Next.js requires default exports there). The barrel `index.ts` files re-export named exports.
- UI primitives use `forwardRef` (see `button.tsx`), accept a `className` prop merged via `cn()`, and support `asChild` via `@radix-ui/react-slot` (Button uses `Slot` when `asChild`, enabling `<Button asChild><Link/></Button>`).
- Props interfaces are named `XProps` and exported alongside the component.
- Styling: Tailwind v4 utility classes + CSS variables. Brand colors are accessed as direct classes (`bg-amber`, `text-cream`, `bg-sage`, `text-blush`) defined in `globals.css` `@theme inline` block, in addition to the semantic tokens (`bg-primary`, `text-foreground`, etc.).

### Tailwind v4 specifics

This project uses **Tailwind CSS v4** (not v3). Differences that bite:
- Config is CSS-first via `@import "tailwindcss"` + `@theme inline { ... }` in `app/globals.css`. There is **no `tailwind.config.ts`**. Colors, fonts, radii, and animations are all CSS variables.
- The PostCSS plugin is `@tailwindcss/postcss` (see `postcss.config.mjs`), not the old `tailwindcss` plugin.
- Dark mode keys off `@media (prefers-color-scheme: dark)` on `:root` (system preference, not a `.dark` class toggle). `useUIStore` has a `locale` field but no dark-mode toggle.
- Custom utilities like `.grain-overlay`, `.text-gradient`, `.glass`, `.line-clamp-2/3` are defined as plain CSS classes at the bottom of `globals.css`.
- `next.config.ts` enables `experimental.optimizePackageImports` for `lucide-react`, `framer-motion`, `gsap` — import named icons/components from these packages directly.

### Animation stack

- **framer-motion** (`motion`, `AnimatePresence`, `useScroll`, `useTransform`, `Variants`) is the primary animation library. All animation components are Client Components.
- **Lenis** provides smooth scrolling via `<SmoothScroll>` wrapping the marketing layout. It respects `prefers-reduced-motion`. Lenis's `raf` loop is driven by the **gsap ticker** (official integration: `lenis.on("scroll", ScrollTrigger.update)` + `gsap.ticker.lagSmoothing(0)`). Because the layout persists across client-side navigations, SmoothScroll recomputes on every route change (`lenis.resize()`, `scrollTo(0, { immediate: true })`, `ScrollTrigger.refresh()`) — without this, Lenis clamps wheel scrolling to the previous page's stale height limit and the page appears stuck.
- **GSAP** + `@gsap/react` drive the `BrandStory` scroll-scrub section (`components/sections/brand-story.tsx`).
- `html` must **not** have `scroll-behavior: smooth` — it conflicts with Lenis (kept out of `globals.css` deliberately).
- **`useLockedBody`** uses a module-level lock counter so overlapping locks (CartDrawer + MobileNav) capture/restore body styles only once — restoring per-instance could leave the body stuck with `overflow: hidden`.
- **three.js** + `@react-three/fiber` + `@react-three/drei` drive the 3D candle in the `ScentExplorer` section (`components/sections/scent-canvas.tsx`, imported dynamically by `scent-explorer.tsx`). The scene is palette-mapped per `ScentCategory` and only animates while the canvas is in view.
- Global reduced-motion handling is in `globals.css` (`@media (prefers-reduced-motion: reduce)` zeroes out animation/transition durations).

### Admin back-office & RBAC

A separate `/admin` back-office exists outside the `(marketing)` route group (no Navbar/Footer/Lenis). It is gated by an **RBAC** system built on four roles and an explicit permission catalogue:

- **Roles** (rank-ordered, `supabase/migrations/0002_rbac_seed.sql`): `customer` (10) → `staff` (20) → `manager` (30) → `admin` (40). All four are live in the `roles` table and are `is_system = true`.
- **Permissions** are explicit keys with no wildcards. The live catalogue has exactly **21** keys: `analytics.read`, `audit.read`, `customer.read`, `customer.update`, `inventory.read`, `inventory.update`, `order.cancel`, `order.create`, `order.read`, `order.read_own`, `order.update`, `product.create`, `product.delete`, `product.read`, `product.update`, `profile.read_own`, `profile.update_own`, `role.manage`, `role.read`, `staff.manage`, `staff.read`. The `*_own` variants are the self-service pairings.
- **Authorization** happens in two places: the **layout** (`app/admin/layout.tsx`) calls `requireActiveActor()` then `requireAnyPermission(MANAGEMENT_PERMISSIONS)` and redirects/403s otherwise; each **action/server function** re-checks the specific permission it needs. Never rely on the layout check alone — it does not protect direct calls into `app/actions/*` or `lib/admin-*.ts`.
- `MANAGEMENT_PERMISSIONS` (the list of keys that grant `/admin` access) lives in `lib/redirect.ts`, which also owns `sanitizeNextPath()` (open-redirect protection) and `resolvePostLoginPath()` (post-login routing: management role → `/admin`, otherwise `/account`).
- `lib/admin.ts`-style helpers are split per domain: `lib/admin-customers.ts`, `lib/admin-products.ts`, `lib/admin-audit.ts`.
- **Customer moderation** (`manageCustomerStatus`, `reinstateCustomer` in `lib/admin-customers.ts`) does **not** write rows directly — it calls atomic, permission-checked Postgres RPCs (`manage_customer_status`, `reinstate_banned_customer`) that re-verify the caller's permission inside the transaction and write an `audit_logs` row. Banned customers cannot be reinstated by un-banning alone; reinstatement is its own RPC. `lib/audit-utils.ts` holds the shared audit helper.

### Currency & i18n

Dual-currency (USD default, VND) and dual-locale (`en`/`vi`) support is scaffolded:
- `formatPrice(amount, currency)` in `lib/utils.ts` handles both, with VND using 0 fraction digits and `vi-VN` locale.
- `CURRENCIES`, `CurrencyCode`, and `SHIPPING` (separate USD/VND thresholds) live in `lib/constants.ts`.
- `SCENT_CATEGORIES` carries bilingual `name`/`nameVi` and `description`/`descriptionVi` fields.
- `next-intl` is wired up **cookie-based, without locale-prefixed routes** (`i18n/request.ts` reads `NEXT_LOCALE`; no `[locale]` segment). `components/layout/i18n-provider.tsx` (a client component in the root layout) owns switching: on toggle it swaps client messages + locale state, writes the `NEXT_LOCALE` cookie (client-side synchronously, plus `setLocaleAction` for server-side persistence), then performs a **genuine full page load** (`window.location.reload()`) so the server re-renders the same route, query string, and hash for the new locale. `useAppLocale()` (`hooks/use-locale.ts`) returns the active locale for both server- and client-rendered code.
- Language switches park the visitor's scroll position in `sessionStorage` (`solenne:locale-scroll-position`) via `lib/locale-scroll-restoration.ts` and restore it once the new locale has rendered — see the module header for the full routine. `I18nProvider` mounts the `useLocaleScrollRestoration()` hook, which is what puts the visitor back in the reloaded document — the outgoing document deliberately does not restore, so the parked payload survives the reload. `SmoothScroll` consults `isLocaleScrollRestorationPending()` before its route-change `lenis.scrollTo(0)`, so a locale switch that ever becomes a real route change cannot reset the viewport to the top. That guard honours both the in-memory in-flight flag and an unconsumed `sessionStorage` payload, so it holds across a genuine full page load too — where the module state is brand new.

## Gotchas

- **`.env.local` is gitignored and contains live Supabase keys.** Never commit it. If env vars are missing, `createClient()` calls will throw at runtime (the `!` non-null assertions hide this from TS).
- **The `BEGIN:nextjs-agent-rules` / `END:nextjs-agent-rules` block at the top of this file is auto-managed by `next dev`.** Do not delete or edit it — `next dev` will re-add it as an uncommitted change. Committing it with your work keeps the tree clean.
- **`CLAUDE.md` is a one-line `@AGENTS.md` include** — edits go in this file, not `CLAUDE.md`.
- **The marketing layout is a Client Component**, so Server Components rendered inside it still work, but any shared layout-level context (e.g. a React Context provider) added there runs on the client.
- **Cart persistence only stores `items`** (via `partialize`) — `isCartOpen` resets to `false` on reload. The `useCart` hook spreads `...store` so `isCartOpen` reflects the in-memory value.
- **The currency toggle is live** in the navbar, mobile nav, and footer (`components/layout/currency-toggle.tsx`), writing to `useUIStore`. `useCart` converts via a fixed `USD_TO_VND` rate (`lib/constants.ts`), not live exchange rates. Product prices are USD-only in Supabase, so all VND display amounts (including shipping/total) are derived.
- **Product images are wired and optimized — do not "fix" them back to placeholders.** `ProductCard`, `ProductGallery`, and `ProductPicture` render real assets. `lib/product-images.ts` maps source filenames to pre-generated AVIF/WebP variants in `public/images/product/optimized/` (widths `384`, `640`, `1200`), and `ProductPicture` emits a `<picture>` with `avif`/`webp` `<source>` elements plus a WebP fallback `<img>`. This **deliberately bypasses the `/_next/image` runtime endpoint**, which is broken on Cloudflare Workers. Only use plain `next/image` when the source is not in the optimized map (the component falls back automatically) — do not switch the optimized path back to `next/image`.
- **The `craft-section.tsx` slides use `next/image` with `unoptimized`**, because the atelier PNGs (Vietnamese filenames) are not in the optimized map and their URLs are passed through `encodeURI`. The section renders **7 slides** while **8 atelier photos** exist in `public/images/product/` — one photo (`Nến Solenne giữa thế giới thủ công.png`) is intentionally unused by the carousel.
- **`contact_messages` and `newsletter_subscribers` exist in production and both flows work.** Migration `supabase/migrations/0013_contact_newsletter_tables.sql` **has already been applied by hand — do NOT run or reapply it** (`scripts/schema-newsletter-contact.sql` is only a superseded pointer to it). Manual testing confirmed a contact submission landing in `contact_messages`, a subscription landing in `newsletter_subscribers`, the unique-email constraint, and the localized duplicate-subscription message. The two server actions still return `{ code: "persist_failed", ... }` instead of swallowing the insert error, so an outage now surfaces an honest bilingual error rather than a false confirmation. The live PostgREST spec is the place to confirm the tables exist — `node scripts/verify-contact-newsletter.mjs` only checks the migration file's static contents and cannot tell you whether it was run.
- **`order_items` has an RLS insert policy that rejects authenticated users' inserts** (new row violates the policy; the policy appears misconfigured — anon inserts are plain-denied too). Order writes therefore go through the secret-key admin client in server actions. If you fix the policy (e.g. `WITH CHECK (auth.uid() = (select user_id from orders o where o.id = order_id))`), the current admin-client flow still works unchanged.
- **Orders are stored in USD.** `useCart` may display VND, but `createOrder` recomputes and stores USD totals from `SHIPPING` USD thresholds; when payment is added, keep the DB in USD and convert only for display.
- **Tests: Node's built-in runner plus static harnesses; E2E needs a staging project for data journeys.** `tests/unit/**/*.test.ts` runs on `node --test` (native TypeScript type stripping, so **Node.js 22.18+** is the floor; 24.x is recommended and CI-tested; `allowImportingTsExtensions` is enabled so tests import `../../lib/x.ts`). `scripts/run-verify.mjs` runs only the 11 CI-safe harnesses. Playwright specs in `tests/e2e/` require `SOLENNE_E2E_BASE_URL`; the five `public-shell.spec.ts` tests (database-free) **are** a PR CI job, while catalogue/account/checkout/admin journeys still need a seeded staging project and are **not** in PR CI. `verify-rbac.mjs` and `verify-dock-layout.mjs` are manual. See `docs/quality/production-readiness.md`.
- **`pnpm lint` runs `eslint` with no path** — it lints per the flat config's default file patterns. To lint a specific file: `npx eslint path/to/file.tsx`.
- **Cloudflare deployment state is UNVERIFIED.** The repo is wired for OpenNext on Cloudflare (`wrangler.jsonc`, `open-next.config.ts`, `worker.js`, and the `build:worker` / `preview` / `deploy` / `upload` scripts), and `/_next/image` is known to be broken on Workers — which is why the optimized `<picture>` pipeline exists. However, **no deployment has been verified**. Do not describe the app as deployed, live, or healthy, and do not assume the current HEAD is the running version, until someone checks the Cloudflare dashboard or runs `wrangler deployments list`.
- **`pnpm build:worker` currently fails at OpenNext's server bundling — this is a known, reproducible blocker, not a credential issue.** After `next build` succeeds, esbuild inlines `sharp` (the app's devDependency used by `scripts/generate-optimized-images.mjs`, and also one of Next's optional dependencies) because Next traces `next/dist/server/image-optimizer.js`, that module statically `require("sharp")`s, and `sharp` is resolvable from the project root; esbuild then aborts with `No loader is configured for ".node" files` / `Could not resolve require("../src/build/Release/sharp-*-*.node")`. OpenNext's `sharp`/`@img` exclusions only skip *copying* traced files, and `images.unoptimized: true` does **not** remove `sharp` from the trace (tested: still 40 entries), so no Next or OpenNext configuration fixes it. The upstream fix is `opennextjs/cloudflare` PR #1433 (stub native addons); the latest published release (1.20.13) does **not** contain it, so re-installing or bumping within 1.20.x will not help. Moving the two `sharp` links and the `.pnpm` `sharp` packages out of resolution with `opennextjs-cloudflare build --skipNextBuild` completes and writes `.open-next/worker.js` — that is diagnostic evidence only, never a fix. On Windows without Developer Mode it fails even earlier (`EPERM ... symlink`) because pnpm links are recreated inside `.open-next/`, and this machine has no WSL/Docker/remote Linux runner, so a Linux-verified Worker build is currently unobtainable. Keep CI on `pnpm build` until that verification happens. See `docs/quality/production-readiness.md` §1. Do not "fix" this by faking Cloudflare credentials, patching `node_modules`, or removing `sharp`.
- **`supabase/.temp/` is gitignored** (added this session). The Supabase CLI writes a `cli-latest` version marker there; it is local state, not source. Do not commit it.
