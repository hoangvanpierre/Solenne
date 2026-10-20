# Solenne — Session Handoff Document
**Date**: October 20, 2026
**Repository**: `D:\solenne`
**Current Head Commit**: `5321104 merge: mobile product detail overlap fix and atelier craft gallery`
**Branch**: `chore/workstation-transfer-20261015` (local branch is **5 commits ahead** of `origin/chore/workstation-transfer-20261015`; **NOT pushed**)
**Upstream `origin/main` is at the same commit `5321104`** — the merge has already landed on `main`.
**Working tree**: 14 modified files + 2 untracked, all uncommitted. Modified: `.gitignore`, `AGENTS.md`, `SESSION_HANDOFF.md`, `app/actions/contact.ts`, `app/actions/newsletter.ts`, `components/sections/contact-form.tsx`, `components/sections/newsletter.tsx`, `lib/validations/contact.ts`, `lib/validations/newsletter.ts`, `messages/en.json`, `messages/vi.json`, `scripts/schema-newsletter-contact.sql`, `scripts/verify-post-login-routing.mjs`, `scripts/verify-product-management.mjs`. Untracked: `supabase/migrations/0013_contact_newsletter_tables.sql`, `scripts/verify-contact-newsletter.mjs`. No temporary/probe files inside the repository (all probes were written to `%TEMP%`).

> **Deployment status: UNVERIFIED.** This document makes **no claim** about whether the current HEAD is deployed to Cloudflare Workers/Pages, nor about the health of any live deployment. The repo has `wrangler.jsonc` and OpenNext config, and `pnpm deploy` exists, but no deployment was performed or verified in this session. Treat production state as unknown until you check Cloudflare directly.

---

## 1. Project Overview

Solenne is a luxury artisan scented-candle e-commerce storefront and back-office management system.
- **Frontend / Fullstack**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion, Lenis smooth scrolling, `next-intl` (dual locale: English `en`, Vietnamese `vi`), Zustand stores.
- **Backend / Database**: Supabase (PostgreSQL, GoTrue Auth, Storage, PostgREST) with custom Role-Based Access Control (RBAC) and Row Level Security (RLS).
- **Hosting / Edge**: Cloudflare Pages / OpenNext Cloudflare Workers (`wrangler.jsonc`, worker name `solenne`).
- **Current Development Phase**: Phase 2 — Storefront Back-Office & Administrative Governance.
  - Phase 2 Module A (Commerce Ops): Order cancellation (A1), fulfillment transitions (A2), inventory adjustments (A3), and audit log viewer (A4) — *Completed and applied in production*.
  - Phase 2 Module B1: Customer Directory & Purchase Overview — *Completed*, migration `0010` applied.
  - Phase 2 Module B2: Customer Account Status Management — *Completed*, migrations `0011` **and** `0012` applied.
  - Module B2's follow-on (**controlled banned-customer reinstatement**) landed in commit `22e5637` with migration `0012` — the previous handoff document predated this and described `0012` as non-existent.

---

## 2. Current Project Architecture

### Directory Structure & Conventions
```
D:\solenne/
├── app/
│   ├── (marketing)/                # Client boundary marketing layout & storefront pages
│   │   ├── products/               # Product listing & details
│   │   ├── collections/            # Scent families
│   │   ├── account/                # Account hub: page.tsx, orders/, address/, profile/
│   │   ├── checkout/               # Checkout + checkout/success receipt
│   │   └── ...                     # about, contact, faq, journal, shipping, care-guide
│   ├── (auth)/                     # Minimal shared layout for the auth pages
│   │   ├── login/ register/ forgot-password/ reset-password/
│   ├── auth/callback/route.ts      # OAuth / PKCE callback → resolvePostLoginPath()
│   ├── actions/                    # Next.js Server Actions ("use server")
│   │   ├── auth.ts                 # Auth flows
│   │   ├── customers.ts            # Module B2 customer status + reinstatement actions
│   │   ├── inventory.ts            # Inventory adjustment action
│   │   ├── orders.ts               # Order cancellation & fulfillment action
│   │   ├── profile.ts              # Customer profile editing action
│   │   └── ...                     # addresses, contact, locale, newsletter, product, products
│   ├── admin/                      # Back-office admin dashboard (gated by permissions)
│   │   ├── audit/                  # Module A4 audit log viewer
│   │   ├── customers/              # Module B1 customer directory
│   │   │   └── [id]/page.tsx       # Customer detail page (Module B1 + B2 status control)
│   │   ├── inventory/              # Inventory management
│   │   ├── orders/                 # Order management & cancellation
│   │   └── products/               # Product catalog management
│   └── layout.tsx                  # Root layout
├── components/
│   ├── admin/                      # Admin components (barrel-exported via index.ts)
│   │   ├── customer-status-badge.tsx
│   │   ├── customer-status-control.tsx   # Module B2 client status control
│   │   ├── customer-table.tsx            # Module B1 customer directory table
│   │   ├── audit-table.tsx
│   │   ├── inventory-adjust-control.tsx
│   │   ├── order-cancel-control.tsx
│   │   └── order-fulfillment-control.tsx
│   ├── account/                    # Account hub UI (order history, address, profile forms)
│   ├── auth/                       # PasswordStrengthMeter only (auth forms live inline in the (auth) pages)
│   ├── address/                    # Shared address form primitives
│   ├── checkout/                   # CheckoutForm and steps
│   ├── layout/                    # Navbar, MobileNav, CartDrawer, Footer, BrandLogo, LocaleToggle, CurrencyToggle, I18nProvider
│   ├── product/                   # ProductCard, ProductGrid, ProductGallery, ProductInfo, ProductPicture, selectors, scent-notes
│   ├── sections/                   # Hero, BrandStory, FeaturedProducts, CraftSection, ScentExplorer, ScentCanvas, Testimonials, Newsletter, ContactForm
│   ├── animations/                 # SmoothScroll, ScrollReveal, TextReveal, TextFillAnimation, ParallaxImage, HorizontalScroll, PinnedSection, MagneticButton
│   └── ui/                         # Primitives (Button, Input, Badge, etc.)
├── hooks/
│   ├── use-authz.tsx               # Client-side UX authorization hook (state, can, role)
│   └── ...                         # use-cart, use-locked-body, use-intersection, use-media-query,
│                                   #   use-locale, use-locale-scroll-restoration, use-same-page-reload
├── lib/
│   ├── admin-customers.ts          # Customer data-access layer (user-scoped Supabase client)
│   ├── admin-products.ts           # Product catalog data-access layer
│   ├── admin-audit.ts              # Audit data-access layer
│   ├── audit-utils.ts              # Client-safe audit utilities, actions, and formatters
│   ├── authz.ts                    # Server-side authorization helpers (requirePermission, requireRole)
│   ├── orders.ts                   # Order queries and management helpers
│   ├── redirect.ts                 # Post-login redirect sanitization + MANAGEMENT_PERMISSIONS
│   ├── product-images.ts           # Static AVIF/WebP variant mapping for the catalog
│   ├── validations/
│   │   ├── customer.ts             # Module B2 customer status transition schema
│   │   ├── account.ts              # Profile and address schemas
│   │   └── orders.ts               # Order schemas
│   └── supabase/
│       ├── client.ts               # Browser client (createBrowserClient)
│       ├── server.ts               # Server client (createServerClient + cookies)
│       └── admin.ts                # Secret-key admin client (restricted to system operations)
├── scripts/
│   ├── generate-optimized-images.mjs  # Build-time AVIF/WebP generator
│   ├── seed-products.mjs             # Re-runnable product seed script
│   ├── cleanup-rbac-stale.mjs        # Stale-RBAC cleanup helper
│   ├── schema-newsletter-contact.sql # SUPERSEDED POINTER — real DDL is 0013
│   └── ...                           # 9 verify-*.mjs harnesses total
└── supabase/
    └── migrations/                 # PostgreSQL migrations (0001 through 0013 — 0001-0012 APPLIED, 0013 PENDING)
```

### RBAC & Security Model
1. **Roles**: `customer` (rank 10), `staff` (rank 20), `manager` (rank 30), `admin` (rank 40).
2. **Permissions**: Seeded in `0002_rbac_seed.sql`. Explicit keys, no wildcards.
   - `staff.manage`: Held **exclusively** by `admin`. Required for account status management **and** banned-customer reinstatement.
   - `customer.read`: Held by `staff`, `manager`, `admin`.
   - `order.read`: Held by `staff`, `manager`, `admin`.
3. **Dual-Layer Authorization**:
   - Application layer: Server Action checks `await requirePermission("staff.manage")` using `lib/authz.ts`.
   - Database layer: PostgreSQL RPC checks `public.has_permission('staff.manage')` inside the `SECURITY DEFINER` boundary.
4. **Column-Level Privilege Hardening on `public.profiles`**:
   - Broad table-level `UPDATE` on `public.profiles` was revoked from `authenticated` in `0011`.
   - `authenticated` was granted `UPDATE (full_name, phone, avatar_url, updated_at)` only.
   - Direct PostgREST attempts to update `status` or `role_id` fail with SQLSTATE `42501`.
5. **Client Architecture**:
   - Client mutations use the **user-scoped** Supabase client (`createClient()` from `@/lib/supabase/server`).
   - The service-role key is **never** used in customer status mutations.
   - `reinstate_banned_customer` additionally revokes `EXECUTE` from `service_role` — the RPC is reachable **only** by an authenticated actor holding `staff.manage`.

---

## 3. What Was Worked On Recently

This handoff covers the work since the previous handoff document (dated October 14, 2026, head `d40b6ab`). That document is **superseded** — it is stale on several points, corrected throughout this file.

### 3.1 Controlled banned-customer reinstatement (Module B2 follow-on)
- Commit `22e5637 feat(admin): add controlled banned customer reinstatement`.
- Added migration `0012_reinstate_banned_customer_atomic.sql`:
  - `public.reinstate_banned_customer(p_customer_id uuid, p_reason text) returns jsonb`.
  - `SECURITY DEFINER` with hardened `search_path` (`''`).
  - Only transitions a **banned** customer back to **active**; rejects non-banned targets with `CUSTOMER_NOT_BANNED`.
  - Self-reinstatement rejected (`SELF_REINSTATEMENT_FORBIDDEN`).
  - Writes an `audit_logs` row with action `customer.reinstated`.
  - Revokes `EXECUTE` from `service_role`; requires `authenticated` + `staff.manage`.
  - Ends with a loud self-verification block that `RAISE EXCEPTION`s on a wrong end state.
- `lib/admin-customers.ts` gained `reinstateCustomer()` calling the RPC via the user-scoped client.
- `app/actions/customers.ts` gained the corresponding server action.
- The `banned` status remains **terminal** for `manage_customer_status` (`BANNED_STATUS_TERMINAL`); reversal is only possible through the dedicated reinstatement RPC.

### 3.2 Customer email display + back-office typography
- Commit `3bd8764 feat(admin): display customer email and upgrade back-office typography to Birthstone`.
- Admin customer tables/detail now surface customer email.
- Back-office typography migrated to the Birthstone family (note: the **storefront** was later migrated to Cactus Classical Serif in `cbc5dfa`).

### 3.3 Typography, performance, and navigation overhaul
- Commit `cbc5dfa feat: migrate to Cactus Classical Serif typography, optimize performance, and refine navigation` — merged via `9dcd333` (PR #1).
- Storefront font is now **Cactus Classical Serif** across `--font-sans`, `--font-serif`, `--font-mono`, `--font-script` in `app/globals.css`.
- Brand social media links updated (`3f18780`).

### 3.4 Mobile product-detail overlap fix + atelier craft gallery
- `f9d91ac fix: prevent mobile product detail overlap` — spacing/overlap corrections in `app/(marketing)/products/[slug]/page.tsx`, `components/product/product-gallery.tsx`, `components/product/size-selector.tsx`, `components/ui/back-to-top.tsx`.
- `fd5e27e feat: add atelier craft gallery imagery and sequential presentation` — `components/sections/craft-section.tsx` gained a sequential, pausable, bilingual slide carousel over seven new atelier photographs in `public/images/product/`.
- Merged as `5321104` (also the tip of `origin/main`).

### 3.5 Contact & newsletter persistence — **DDL promoted to migration `0013` and applied to production**

This session queried the live Supabase project and confirmed a real gap that the previous documentation did not record:

- The live PostgREST OpenAPI spec (`GET /rest/v1/` with the secret key) exposes exactly **11 relations** in its `definitions` block: `order_outbox_events`, `role_permissions`, `orders`, `audit_logs`, `order_items`, `products`, `roles`, `profiles`, `addresses`, `product_variants`, `permissions`.
- **`contact_messages` and `newsletter_subscribers` were absent from that list** — i.e. they had never been created in the live project at the time of this audit. (They have since been created by applying `0013` — see the resolution note below.)
- `app/actions/contact.ts` → `admin.from("contact_messages").insert(...)` and `app/actions/newsletter.ts` → `admin.from("newsletter_subscribers").insert(...)` both hit missing relations.

**The original failure mode was silent.** Both actions caught the insert error and returned `{ success: true }` regardless:

```ts
const { error } = await admin.from("contact_messages").insert({ ... });
if (error) {
  console.warn("Could not insert into contact_messages table:", error.message);
  console.info("[Contact Submission Received]", validated.data);
}
return { success: true };
```

So the contact form and the newsletter signup reported *"Thank you for subscribing!"* to the visitor while **nothing was persisted**.

**Both halves of the gap are now fixed in the working tree:**

1. **DDL promoted to a numbered migration.** `supabase/migrations/0013_contact_newsletter_tables.sql` contains idempotent `create table if not exists` for both relations, RLS enabled with **no** permissive policies, `revoke all ... from anon, authenticated, public`, `grant select, insert ... to service_role`, and a `DO $$` block that `RAISE EXCEPTION`s if the end state is wrong (and prints `--- Solenne 0013 OK: ...` when it is right). `scripts/schema-newsletter-contact.sql` was gutted into a non-executable pointer that directs readers to `0013` — it no longer contains `CREATE TABLE`, `CREATE POLICY`, or any grant, so nobody can accidentally re-apply the old broad `WITH CHECK (true)` shape.
2. **Actions no longer report false success.** `submitContactAction` and `subscribeNewsletterAction` now `console.error` and return `{ code: "persist_failed", error: ... }` on a failed insert; the `catch` branches do the same. Success is returned only after a clean insert. The newsletter's `23505` duplicate branch remains a legitimate success, now tagged `{ success: true, code: "already_subscribed" }`. Validation failures return `{ code: "validation" }`.
3. **Failure copy is bilingual.** The actions return machine-readable `code`s; the UI maps them onto `messages/en.json` / `messages/vi.json` keys (`contact.errorServer`, `contact.errorValidation`, `contact.errorUnexpected`, `newsletter.errorEmail`, `newsletter.errorPersist`, `newsletter.successDuplicate`) rather than rendering the English `error` string.

**RESOLVED — `0013` has been applied to production.** The contact form and newsletter signup are now functional: a contact submission lands in `contact_messages`, a subscription lands in `newsletter_subscribers`, the unique-email constraint rejects duplicates, and a duplicate signup renders the localized `newsletter.successDuplicate` message. **Do not run or reapply `0013`.**

**Originally, to close the gap:** apply `supabase/migrations/0013_contact_newsletter_tables.sql` in the Supabase SQL editor (there is no migration runner in this repo), confirm the `--- Solenne 0013 OK: ...` notice fires, then re-read `GET /rest/v1/` and confirm both relations appear. Finally smoke-test a contact submission, a newsletter signup, and a duplicate newsletter signup. Guarded by `node scripts/verify-contact-newsletter.mjs`.

---

## 4. Completed Tasks

- [x] Migration `0012_reinstate_banned_customer_atomic.sql` authored, **applied to the live database**, and verified.
- [x] `reinstateCustomer()` server-side helper + server action wired to the RPC.
- [x] Customer email surfaced in the admin customer directory and detail view.
- [x] Back-office typography upgraded to Birthstone.
- [x] Storefront typography migrated to Cactus Classical Serif.
- [x] Mobile product-detail overlap fixed.
- [x] Atelier craft gallery imagery + sequential presentation added.
- [x] Brand social media links updated.
- [x] Migrations `0001`–`0012` confirmed **applied live** at the time (12 of 13; `0013` authored this session) — **`0013` has since been applied to production as well**, so all 13 are live.
- [x] **All 19 live RPCs** confirmed present with confirmed parameter types and required flags (read from the live PostgREST OpenAPI spec).
- [x] **Live table inventory confirmed: 11 relations** — `contact_messages` and `newsletter_subscribers` confirmed **absent from the live database** at the time of this audit. Documented in §3.5 and added to `AGENTS.md`. (Both now exist — `0013` has been applied to production.)
- [x] **Contact/newsletter false-success bug fixed** — `submitContactAction` and `subscribeNewsletterAction` now return `{ code: "persist_failed", ... }` instead of `{ success: true }` when the insert fails; `23505` remains a benign success tagged `already_subscribed`.
- [x] **DDL promoted to `supabase/migrations/0013_contact_newsletter_tables.sql`** — RLS on, no public policies, `service_role`-only writes, self-verifying `DO $$` block. `scripts/schema-newsletter-contact.sql` reduced to a superseded pointer.
- [x] **Failure copy made bilingual** — `contact.errorServer` / `contact.errorValidation` / `contact.errorUnexpected` and `newsletter.errorEmail` / `newsletter.errorPersist` / `newsletter.successDuplicate` added to both `messages/en.json` and `messages/vi.json`, and both UI components now render the localized key instead of the English action string.
- [x] `update_order_status.p_tracking_code` confirmed as a **real live parameter** (previously missing from the docs).
- [x] Live `roles` (4) and `permissions` (21) catalogues confirmed.
- [x] `audit_logs` confirmed to contain `customer.status_changed` and `customer.reinstated` activity.
- [x] `npx tsc --noEmit` — 0 errors.
- [x] `pnpm lint` — 0 errors (3 pre-existing `react-hooks/exhaustive-deps` warnings in `hooks/use-intersection.ts`).
- [x] `pnpm exec next build` — **passes** (full route table generated, exit 0).
- [x] Image regeneration confirmed **deterministic** — `node scripts/generate-optimized-images.mjs` produces zero git diff.
- [x] **All 9 `scripts/verify-*.mjs` harnesses pass** (8 pre-existing + `verify-contact-newsletter`, which reports `92 passed, 0 failed`).
- [x] `scripts/verify-product-management.mjs` de-staled (CRLF/whitespace-independent assertions) — the application was always correct.
- [x] `scripts/verify-post-login-routing.mjs` de-staled (recognises `PROTECTED_ROUTE_SEGMENTS` / `isProtectedPath()`).
- [x] Working tree contains no temporary probe scripts (all probes live in `%TEMP%`, outside the repo).

**RESOLVED:** migration `0013` was applied to production by hand (outside this environment's Supabase access), and contact + newsletter were smoke-tested end to end, including a duplicate email. Nothing is left open for `0013` — do not re-run it.

---

## 5. Files Created (recent)

1. `supabase/migrations/0012_reinstate_banned_customer_atomic.sql`
2. `supabase/migrations/0013_contact_newsletter_tables.sql` — contact/newsletter tables, RLS + `service_role`-only writes, self-verifying. **Applied to production — do not re-run.**
3. `scripts/verify-contact-newsletter.mjs` — 9th harness; 92 static checks over 0013, the legacy pointer script, both actions, both UI components, and the bilingual keys.
4. `public/images/product/*.png` — **eight** atelier photographs for the craft gallery (the carousel uses seven of them).
5. `public/images/product/optimized/*` — 36 generated AVIF/WebP variants (6 slugs × 3 widths × 2 formats).

## 6. Files Modified (recent)

1. `lib/admin-customers.ts` — added `reinstateCustomer()`.
2. `app/actions/customers.ts` — added the reinstatement server action.
3. `lib/audit-utils.ts` — added the `customer.reinstated` action + bilingual formatter.
4. `components/admin/*` — customer email column, Birthstone typography.
5. `app/globals.css` — Cactus Classical Serif font variables.
6. `components/sections/craft-section.tsx` — sequential craft gallery carousel.
7. `components/product/product-gallery.tsx`, `components/product/size-selector.tsx`, `components/ui/back-to-top.tsx` — mobile overlap fixes.
8. `lib/constants.ts` — brand social media links.
9. `scripts/verify-product-management.mjs` — CRLF normalization + whitespace-independent `.from(table).delete()` detection.
10. `scripts/verify-post-login-routing.mjs` — recognise `PROTECTED_ROUTE_SEGMENTS` / `isProtectedPath()` protection alongside inline checks.
11. `AGENTS.md` — 19-RPC live inventory, `isProtectedPath()` protection model, live role/permission catalogue, craft-slide count, corrected `app/` routing tree (`checkout`/`account` live under `(marketing)`, plus the `(auth)` group and `/auth/callback`), the full `components/` directory list, and the 0013/contact-newsletter rework.
12. `SESSION_HANDOFF.md` — this document (live RPC/database/audit/media/harness/git findings).
13. `app/actions/contact.ts` — error propagation (`code: "validation" | "persist_failed"`), no more false success.
14. `app/actions/newsletter.ts` — same, plus `already_subscribed` tag on the `23505` branch.
15. `lib/validations/contact.ts` / `lib/validations/newsletter.ts` — export `ContactErrorCode` / `NewsletterErrorCode` discriminants.
16. `components/sections/contact-form.tsx` / `components/sections/newsletter.tsx` — render localized keys instead of the English action string.
17. `messages/en.json` / `messages/vi.json` — six new bilingual failure keys.
18. `scripts/schema-newsletter-contact.sql` — gutted to a superseded pointer.

---

## 7. Live Database Inventory (verified 2026-10-20)

All **13** migrations `0001`–`0013` in `supabase/migrations/` are applied to the live project (`0001`–`0012` verified against the live schema on 2026-10-20; `0013` applied manually to production afterwards).

### 7.1 Live RPC inventory — 19 RPCs

Verified against the **live PostgREST OpenAPI spec** (`GET /rest/v1/` with the secret key, reading `paths["/rpc/<name>"]`). This is the authoritative source for signatures — the repo migrations only define a subset. `*` = required parameter.

| RPC | Parameters | Live | Notes |
| --- | --- | --- | --- |
| `adjust_inventory_stock` | `p_variant_id uuid*`, `p_delta integer*`, `p_reason text*` | ✅ | All three required. |
| `cancel_order` | `p_order_id uuid*`, `p_reason text` | ✅ | Reason optional. Emits outbox event (`0008`). |
| `count_active_admins` | — | ✅ | Last-admin lockout guard. |
| `current_actor` | — | ✅ | Actor context; used by `lib/authz.ts` + middleware. |
| `current_role_name` | — | ✅ | |
| `current_role_rank` | — | ✅ | |
| `customer_role_id` | — | ✅ | `SECURITY DEFINER` helper (`0010`). |
| `default_role_id` | — | ✅ | Default role for new profiles. |
| `get_customer_purchase_metrics` | `p_user_ids uuid[]*` | ✅ | Admin directory metrics. |
| `has_min_role_rank` | `p_rank integer*` | ✅ | |
| `has_permission` | `p_key text*` | ✅ | Explicit keys, no wildcards. |
| `has_role` | `p_name text*` | ✅ | |
| `is_active_account` | — | ✅ | Profile guard helper. |
| `manage_customer_status` | `p_customer_id uuid*`, `p_target_status text*`, `p_reason text*` | ✅ | All three required. `banned` terminal here. |
| `reinstate_banned_customer` | `p_customer_id uuid*`, `p_reason text*` | ✅ | `EXECUTE` revoked from `service_role` — **intended**. |
| `requesting_role` | — | ✅ | DB role of the current request. |
| `rls_auto_enable` | — | ✅ | **Not in the repo migrations** — created out-of-band. Do not drop. |
| `role_id_by_name` | `p_name text*` | ✅ | `SECURITY INVOKER`. |
| `update_order_status` | `p_order_id uuid*`, `p_target_status text*`, `p_reason text`, `p_tracking_code text` | ✅ | **`p_tracking_code` is a real live parameter** (from migration `0007`) that stores the courier code on the `shipped` transition. Only the first two are required. |

> **Correction to the previous handoff:** the earlier table listed only 8 RPCs and omitted `p_tracking_code` from `update_order_status`. The live database exposes **19** RPCs, and `p_tracking_code` is genuinely present and consumed by `app/actions/orders.ts` → `components/admin/order-fulfillment-control.tsx`.

### 7.2 Roles & permissions (live)

**4 roles**, all `is_system = true`:

| Role | Rank | Id |
| --- | --- | --- |
| `customer` | 10 | `91673b6b-06e6-4901-93e4-8268445975f3` |
| `staff` | 20 | `697f2d0f-7bb8-40e1-9bba-850935f040a4` |
| `manager` | 30 | `c67192d8-326d-4f94-aa02-576b4e3b96d7` |
| `admin` | 40 | `f0e40415-a0d6-47aa-8a5e-bfd5adf91fe1` |

**21 permission keys** live: `analytics.read`, `audit.read`, `customer.read`, `customer.update`, `inventory.read`, `inventory.update`, `order.cancel`, `order.create`, `order.read`, `order.read_own`, `order.update`, `product.create`, `product.delete`, `product.read`, `product.update`, `profile.read_own`, `profile.update_own`, `role.manage`, `role.read`, `staff.manage`, `staff.read`.

### 7.3 `audit_logs` action distribution (all rows, most recent 1000)

| Action | Count |
| --- | --- |
| `order.status_transition` | 19 |
| `inventory.adjusted` | 17 |
| `user.role_changed` | 14 |
| `customer.status_changed` | 7 |
| `order.cancelled` | 5 |
| `rbac.verification` | 5 |
| `order.fulfillment_rollback` | 2 |
| `customer.reinstated` | 2 |

Both customer-moderation audit actions are present and populated — the moderation path is **exercised in production**, not merely defined. The same 8 distinct actions were previously reported over a 200-row window; a 1000-row window returns the identical distribution, so the audit table is not growing unboundedly.

### 7.4 Live table inventory (11 relations)

Read from the `definitions` block of the live PostgREST OpenAPI spec:

| Relation | Origin | Notes |
| --- | --- | --- |
| `orders` | pre-existing | Totals stored in **USD**. |
| `order_items` | pre-existing | Line items; `INSERT` policy rejects `authenticated` writes. |
| `order_outbox_events` | migration `0007` | Written by `cancel_order` (migration `0008`). |
| `products` | pre-existing | 6 live rows, one image each. |
| `product_variants` | pre-existing | Stock decremented with an optimistic-concurrency guard. |
| `profiles` | pre-existing, altered by `0001` | `status` writable only through the RPCs. |
| `addresses` | pre-existing | One default address per user. |
| `roles` | `0001` / `0002` | 4 system roles. |
| `permissions` | `0001` / `0002` | 21 explicit keys. |
| `role_permissions` | `0001` / `0002` | Role → permission matrix. |
| `audit_logs` | `0001` | 71 rows / 8 distinct actions. |

**Absent from the live schema:** `contact_messages` and `newsletter_subscribers` — see §3.5.

### 7.5 Product catalog

All **6** live products carry exactly one image each, and every one of those filenames is covered by the optimized map in `lib/product-images.ts`:

| Product slug | Image |
| --- | --- |
| `midnight-garden` | `/images/product/Solenne Midnight Garden Candle Glow.png` |
| `wild-lavender` | `/images/product/Solenne Lavender Serenity.png` |
| `cedar-sage` | `/images/product/Solenne Cedar & Sage.jpg` |
| `ocean-breeze` | `/images/product/Solenne Ocean Breeze.jpg` |
| `vanilla-ember` | `/images/product/Solenne Vanilla Ember.png` |
| `golden-hour` | `/images/product/Solenne Golden Hours.jpg` |

### 7.6 Media inventory (filesystem)

- `public/images/product/` — **15 source files**: 6 catalog images (3 PNG, 3 JPG), 8 atelier PNGs, and `solenne_logo.png`.
- `public/images/product/optimized/` — **36 generated variants** (6 slugs × widths `384`/`640`/`1200` × AVIF/WebP).
- `components/sections/craft-section.tsx` renders **7 slides** from the 8 available atelier photos. The unused photo is `Nến Solenne giữa thế giới thủ công.png`. This is intentional, not a missing asset.


---

## 8. Product Image Pipeline (implemented — previously documented as missing)

The previous handoff and `AGENTS.md` both claimed product images were placeholder-only. **That is no longer true.**

- `scripts/generate-optimized-images.mjs` reads the source PNG/JPGs in `public/images/product/` and emits **36 variants** (6 slugs × widths `384`/`640`/`1200` × AVIF/WebP) into `public/images/product/optimized/`.
- `lib/product-images.ts` maps source filenames → variant slugs and builds `avifSrcSet` / `webpSrcSet` / `fallbackSrc`.
- `components/product/product-picture.tsx` renders a `<picture>` with AVIF and WebP `<source>` elements plus a WebP fallback `<img>`, **bypassing the `/_next/image` runtime endpoint** (which is broken on Cloudflare Workers). It falls back to plain `next/image` for sources outside the map.
- `ProductCard` and `ProductGallery` both render through `ProductPicture`.
- `pnpm build` (and the worker build/deploy scripts) run the generator first. **The generator is deterministic** — re-running it leaves the tree clean, so there is no reason to avoid `pnpm build` anymore.

---

## 9. Current Implementation Status

- **Module A (A1–A4)**: Complete and applied in production.
- **Module B1**: Complete and applied in production (migration `0010`).
- **Module B2 (status management)**: Complete and applied in production (migration `0011`).
- **Module B2 follow-on (reinstatement)**: Complete and applied in production (migration `0012`).
- **Stripe / online payment**: **Not built.** Orders are stored with status `pending` ("Pending Payment"). `stripe_session_id` / `stripe_payment_intent` columns are ready. Stripe deps are installed but unused.
- **Journal content**: static placeholder posts in `lib/journal.ts`.
- **Contact form & newsletter signup**: **Code complete, persistence broken.** The DDL exists (`scripts/schema-newsletter-contact.sql`) but the tables were never created in the live project, and both server actions swallow the insert error and return success. Both features silently drop every submission. See §3.5.

---

## 10. Verification Performed This Session

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | ✅ 0 errors |
| Lint | `pnpm lint` | ✅ 0 errors, 3 warnings (`hooks/use-intersection.ts`) |
| Production build | `pnpm exec next build` | ✅ exit 0, all routes generated |
| Image determinism | `node scripts/generate-optimized-images.mjs` | ✅ 0 git diff |
| Live RPC inventory | PostgREST OpenAPI spec (`GET /rest/v1/`) | ✅ **19/19** RPCs present with confirmed parameter types + required flags |
| Live roles / permissions | PostgREST `roles` + `permissions` | ✅ 4 roles, 21 permission keys |
| Live audit trail | `audit_logs` query (limit 1000) | ✅ 8 distinct actions present |
| Live catalog images | `products` query | ✅ 6/6 products have images, all in the optimized map |
| Live table inventory | PostgREST OpenAPI spec (`definitions` block) | ⚠️ **11 relations** — `contact_messages` and `newsletter_subscribers` are **absent** (§3.5) |
| Media inventory | filesystem scan of `public/images/product/` | ✅ 15 sources + 36 optimized variants; craft carousel uses 7 of 8 atelier photos |
| Working tree | `git status --short` | ✅ exactly 4 modified files (`AGENTS.md`, `SESSION_HANDOFF.md`, and the two de-staled harnesses); no untracked files |
| Whitespace check | `git diff --check` | ✅ exit 0 |

### 10.1 Verification harnesses (all 8)

All eight `scripts/verify-*.mjs` harnesses were run and **all pass**. There is no `pnpm test` script — run them directly:

```powershell
node scripts/verify-rbac.mjs
node scripts/verify-cancel-order.mjs
node scripts/verify-fulfillment-transitions.mjs
node scripts/verify-inventory-adjustment.mjs
node scripts/verify-customer-status.mjs
node scripts/verify-product-management.mjs
node scripts/verify-post-login-routing.mjs
node scripts/verify-callback-redirect.mjs
node scripts/verify-contact-newsletter.mjs
```

**Two harnesses were failing at the start of this session and both were fixed — the failures were in the harnesses, not the application:**

1. `scripts/verify-product-management.mjs` — its assertions matched the product-deletion code with exact multiline/indentation-sensitive string comparisons, so they broke on formatting/CRLF changes. It now normalizes line endings and locates the real `.from(<table>).delete()` calls with a whitespace-independent regex. **The underlying application behaviour was always correct: `product_variants` rows are deleted before the parent `products` row.**
2. `scripts/verify-post-login-routing.mjs` — it only recognised protection implemented as inline `pathname.startsWith(...)` checks. Production protection is actually centralized in `lib/supabase/middleware.ts` as `PROTECTED_ROUTE_SEGMENTS` + the exported `isProtectedPath()` helper. The harness now recognises both forms (the centralized helper **and** inline checks), so it validates the real implementation rather than a stale assumption.

Both harnesses were re-run after the fix and now pass.


---

## 11. Loose Ends / Open Questions

1. **Production deployment is unconfirmed.** Nothing in this session verified whether `5321104` is live on Cloudflare. The repo has `wrangler.jsonc` + OpenNext config and a `pnpm deploy` script, but **no deployment was performed or verified**. Check the Cloudflare dashboard / `wrangler deployments list` before assuming. Do not describe the app as deployed or healthy until that check is done.
2. **The local branch is 5 commits ahead of its remote.** `chore/workstation-transfer-20261015` tracks `origin/chore/workstation-transfer-20261015` at `cbc5dfa`; HEAD is `5321104`. `origin/main` is already at `5321104`. Decide whether to push the branch, or just work from `main`.
3. **The next migration will be `0014`.** `0013` (contact/newsletter tables) already exists and is **applied to production**. New schema changes need a new numbered migration, applied manually via the Supabase SQL editor. There is **no migration runner script** in the repo.
4. **`scripts/cleanup-rbac-stale.mjs`** exists as a one-off data cleanup utility; it is not part of any verification harness.
5. **Three lint warnings** remain in `hooks/use-intersection.ts` (`react-hooks/exhaustive-deps`). Harmless, but unaddressed.
6. **The live schema contains objects that are NOT in the repo migrations** — notably the `rls_auto_enable` RPC, plus the `roles`/`permissions`/`audit_logs` tables seeded by `0002`. There is no drift-detection script; if you need the true live surface, re-read the PostgREST OpenAPI spec rather than trusting the migration files alone.
7. **Repository hygiene**: the temporary probe scripts used to inspect the live database were written to the **system temp directory** (`%TEMP%\solenne-probe-*.cjs`), never inside `D:\solenne`. The repository contains no probe or scratch files. The working tree has **14 modified files and 2 untracked files** (see the header of this document for the exact list).
8. **The contact and newsletter tables now EXIST in the live database.** Migration `supabase/migrations/0013_contact_newsletter_tables.sql` has **been applied to production**, so `contact_messages` and `newsletter_subscribers` are live relations holding real rows, with the unique-email constraint on `newsletter_subscribers.email`. The server actions still return `{ code: "persist_failed", ... }` rather than swallowing an insert error, so an outage surfaces an honest bilingual error instead of a false confirmation. See §3.5. **Do not apply `0013` again.** To confirm the live surface, re-read `GET /rest/v1/` — the static harness cannot tell you whether a migration was run.
9. **Migration `0013` is applied**, so the repo now has **13** migration files, all live. When re-checking "all migrations applied", there is no longer an `0013` caveat to add — but do not *re-run* `0013` either. It is covered by `scripts/verify-contact-newsletter.mjs`, which checks the file's contents statically — that harness cannot tell you whether the migration has been run.

---

## 12. What Should NOT Be Changed

1. **Do NOT reintroduce placeholder product images.** The optimized AVIF/WebP path is deliberate (`/_next/image` is broken on Cloudflare Workers). Do not swap `ProductPicture` back to plain `next/image`.
2. **Do NOT "fix" the RBAC hardening.** Specifically: keep `banned` terminal in `manage_customer_status`, keep `EXECUTE` revoked from `service_role` on `reinstate_banned_customer`, keep the `search_path` hardened to `''`, and keep `authenticated` without table-level `UPDATE` on `profiles.status`. Each is guarded by a `RAISE EXCEPTION` verification block at the end of its migration.
3. **Do NOT run broad Git commands**: avoid `git add -A`, `git add .`, `git commit -a`, `git clean`, `git reset --hard`, `git checkout --`.
4. **Migrations `0001`–`0013`**: must not be rerun, modified, or deleted. All 13 are applied in production and contain verification blocks that assume the current end state. **This now includes `0013_contact_newsletter_tables.sql`** — it has been applied by hand, so do not run or reapply it, and do not treat it as an exception to this rule. If the contact/newsletter tables ever need changing, author a *new* migration (`0014`).
5. **`.env.local`** is gitignored and holds live Supabase keys — never commit it, and never echo its contents into docs or logs.
6. **The `BEGIN:nextjs-agent-rules` block** at the top of `AGENTS.md` is auto-managed by `next dev` — do not delete or hand-edit it.

---

## 13. The Exact Next Recommended Steps

When the next session starts:
1. **Preflight status check**:
   ```powershell
   git status --short
   git status -sb
   git log -5 --oneline
   ```
   Expect the Contact/Newsletter work to be already committed. Unrelated leftover changes are `.gitignore` (adds `supabase/.temp/`) and the two de-staled harnesses (`scripts/verify-post-login-routing.mjs`, `scripts/verify-product-management.mjs`) if they were not yet committed — do not stage them blindly, and never `git add .`.
2. **Confirm deployment state** — check Cloudflare for whether `5321104` is live. Do not assume, and do not describe the app as deployed or healthy until this check passes.
3. **Apply the contact/newsletter schema** (see §3.5) — **DONE: migration `0013` has already been applied to production and both flows were smoke-tested. Do not run it again.**
4. **Review with user**:
   - **Option A**: Push the local branch (or reconcile the branch with `main`).
   - **Option B**: Apply the next numbered migration (`0014`) for the next Phase 2 module (e.g. Module B3 — Staff & Role Management). `0013` is already applied — do not reuse that number.
   - **Option C**: Build the Stripe payment path — the largest functional gap in the storefront.

---

## 14. Context That a New AI Session Must Know

- Solenne is built on Next.js 16 App Router where page dynamic params are promises: `params: Promise<{ id: string }>`. Always `await params`.
- All admin component imports must use barrel exports: `import { CustomerStatusControl } from "@/components/admin"`.
- Named exports are required for all components (except `page.tsx` and `layout.tsx` which require default exports).
- All UI text must be bilingual (`isVi ? "..." : "..."`).
- In Server Actions, never trust user ID from client arguments — always obtain it from `await requirePermission(...)` or `auth.getUser()`.
- Server Actions must use the user-scoped client `createClient()` from `@/lib/supabase/server`. Do not use `createAdminClient()` or secret keys for user-initiated mutations unless explicitly required for a system operation that bypasses RLS by design.
- The `BEGIN:nextjs-agent-rules` block in `AGENTS.md` is regenerated by `next dev`; do not delete it.
- **Route protection is centralized, not inline.** `lib/supabase/middleware.ts` exports `PROTECTED_ROUTE_SEGMENTS` (`/admin`, `/account`, `/checkout`) and the `isProtectedPath(pathname)` helper, which matches by **path segment**, not by a broad string prefix. Post-login redirects are role-aware via `lib/redirect.ts`.
- **The live database is the source of truth for RPC signatures, not the repo migrations.** There are **19 live RPCs**; the migrations only define a subset, and `rls_auto_enable` exists live but in no migration file. Read the live PostgREST OpenAPI spec when you need the true surface.
- **All 9 `scripts/verify-*.mjs` harnesses pass.** They are not wired into `pnpm test` (there is no test script) — run them with `node` directly. Two of them (`verify-product-management`, `verify-post-login-routing`) were de-staled earlier; the newest, `verify-contact-newsletter`, was added with migration `0013`. Prefer whitespace-independent, behavior-focused assertions in any new harness.
- **The contact/newsletter tables are absent from the live database** — migration `0013` exists in the repo but has **not been applied**. The two server actions now correctly report failure instead of returning `{ success: true }`, so the UI **shows an error until `0013` is applied**. **Do not describe contact or newsletter as functional** until `0013` is applied and both relations appear in `GET /rest/v1/`. See §3.5.

- **Trust `git log` over this handoff document.** If the two disagree, the git history is authoritative — this document was written from a verified snapshot and can itself go stale.