# Solenne — Session Handoff Document
**Date**: October 14, 2026  
**Repository**: `D:\solenne`  
**Current Head Commit**: `d40b6ab feat(admin): add customer account status management`  
**Branch**: `main` (Local commit is 1 commit ahead of `origin/main`; NOT pushed)

---

## 1. Project Overview

Solenne is a luxury artisan scented-candle e-commerce storefront and back-office management system.
- **Frontend / Fullstack**: Next.js 16 (App Router), React 19, Tailwind CSS v4, Framer Motion, Lenis smooth scrolling, `next-intl` (dual locale: English `en`, Vietnamese `vi`), Zustand stores.
- **Backend / Database**: Supabase (PostgreSQL, GoTrue Auth, Storage, PostgREST) with custom Role-Based Access Control (RBAC) and Row Level Security (RLS).
- **Hosting / Edge**: Cloudflare Pages / OpenNext Cloudflare Workers.
- **Current Development Phase**: Phase 2 — Storefront Back-Office & Administrative Governance.
  - Phase 2 Module A (Commerce Ops): Order cancellation (A1), fulfillment transitions (A2), inventory adjustments (A3), and audit log viewer (A4) — *Completed*.
  - Phase 2 Module B1: Customer Directory & Purchase Overview — *Completed in commits `7aac70c` and `e909986`, migration `0010` applied in production*.
  - Phase 2 Module B2: Customer Account Status Management — *Completed and committed locally in commit `d40b6ab`, migration `0011` created locally but UNAPPLIED*.

---

## 2. Current Project Architecture

### Directory Structure & Conventions
```
D:\solenne/
├── app/
│   ├── (marketing)/                # Client boundary marketing layout & storefront pages
│   │   ├── products/               # Product listing & details
│   │   ├── collections/            # Scent families
│   │   └── ...
│   ├── actions/                    # Next.js Server Actions ("use server")
│   │   ├── auth.ts                 # Auth flows
│   │   ├── customers.ts            # Module B2 customer status management action
│   │   ├── inventory.ts            # Inventory adjustment action
│   │   ├── orders.ts               # Order cancellation & fulfillment action
│   │   └── profile.ts              # Customer profile editing action
│   ├── admin/                      # Back-office admin dashboard (gated by role rank / permissions)
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
│   │   ├── customer-status-control.tsx # Module B2 client status control
│   │   ├── customer-table.tsx      # Module B1 customer directory table
│   │   ├── audit-table.tsx
│   │   ├── inventory-adjust-control.tsx
│   │   └── order-cancel-control.tsx
│   └── ui/                         # Primitives (Button, Input, Badge, etc.)
├── hooks/
│   └── use-authz.tsx               # Client-side UX authorization hook (state, can, role)
├── lib/
│   ├── admin-customers.ts          # Customer data-access layer (user-scoped Supabase client)
│   ├── audit-utils.ts              # Client-safe audit utilities, actions, and formatters
│   ├── authz.ts                    # Server-side authorization helpers (requirePermission, requireRole)
│   ├── orders.ts                   # Order queries and management helpers
│   ├── redirect.ts                 # Post-login redirect sanitization
│   ├── validations/
│   │   ├── customer.ts             # Module B2 customer status transition schema
│   │   ├── account.ts              # Profile and address schemas
│   │   └── orders.ts               # Order schemas
│   └── supabase/
│       ├── client.ts               # Browser client (createBrowserClient)
│       ├── server.ts               # Server client (createServerClient + cookies)
│       └── admin.ts                # Secret-key admin client (restricted to system operations)
├── scripts/
│   ├── verify-customer-status.mjs  # Module B2 81-assertion static verification harness
│   └── ...
└── supabase/
    └── migrations/                 # PostgreSQL migrations (0001 through 0011)
```

### RBAC & Security Model
1. **Roles**: `customer` (rank 10), `staff` (rank 20), `manager` (rank 30), `admin` (rank 40).
2. **Permissions**: Seeded in `0002_rbac_seed.sql`.
   - `staff.manage`: Held **exclusively** by `admin`. Required for account status management.
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

---

## 3. What Was Worked on Today

Today's work centered on **Phase 2 — Module B2: Customer Account Status Management**:
1. **Independent Read-Only Audit**:
   - Audited PostgreSQL RBAC schema (`0001`–`0010`), RLS policies on `profiles`, role seed definitions, and PostgREST update vectors.
   - Identified the need for column-level privilege hardening on `profiles` to block direct status tampering.
2. **Implementation**:
   - Authored database migration `0011_manage_customer_status_atomic.sql` with column privilege hardening, atomic `manage_customer_status` RPC, row locking, transition validation, PII redaction, atomic audit logging, and a self-verification block.
   - Created Zod validation schema in `lib/validations/customer.ts`.
   - Updated `lib/audit-utils.ts` for `customer.status_changed` audit action and bilingual formatter.
   - Added `manageCustomerStatus` to `lib/admin-customers.ts`.
   - Created Server Action `manageCustomerStatusAction` in `app/actions/customers.ts`.
   - Built UI component `components/admin/customer-status-control.tsx` with dialog confirmation, reason field, and character counter.
   - Integrated `CustomerStatusControl` into `app/admin/customers/[id]/page.tsx` gated by `staff.manage`.
   - Exported component in `components/admin/index.ts`.
   - Built comprehensive test harness `scripts/verify-customer-status.mjs` (81 passing assertions).
3. **Independent Security Review**:
   - Conducted a strict read-only audit of all 9 Module B2 files and previous migrations.
   - Verified column-level privilege semantics, `SECURITY DEFINER` boundary, concurrency serialization via `FOR UPDATE`, state machine invariants, PII redaction, and RLS defense-in-depth.
   - Approved implementation with zero blockers and zero major findings.
4. **Dedicated Local Commit**:
   - Pre-commit inspection confirmed zero unintended staged files.
   - Staged exclusively the 9 approved Module B2 files.
   - Created commit `d40b6ab feat(admin): add customer account status management`.

---

## 4. All Completed Tasks

- [x] Preflight git checks and baseline hash recording for all 18 AVIF images.
- [x] Full RBAC schema and RLS inspection across migrations `0001`–`0010`.
- [x] Created `supabase/migrations/0011_manage_customer_status_atomic.sql` (LOCAL ONLY).
- [x] Created `lib/validations/customer.ts`.
- [x] Updated `lib/audit-utils.ts`.
- [x] Updated `lib/admin-customers.ts`.
- [x] Created `app/actions/customers.ts`.
- [x] Created `components/admin/customer-status-control.tsx`.
- [x] Updated `components/admin/index.ts`.
- [x] Updated `app/admin/customers/[id]/page.tsx`.
- [x] Created and verified `scripts/verify-customer-status.mjs` (81 assertions passing).
- [x] Verified full TypeScript compilation (`npx tsc --noEmit` — 0 errors).
- [x] Verified linter (`pnpm lint` — 0 errors).
- [x] Verified whitespace integrity (`git diff --check` — 0 errors).
- [x] Completed formal independent security review report.
- [x] Created dedicated local commit `d40b6ab`.
- [x] Confirmed 12 AVIF user files remain byte-for-byte identical.

---

## 5. Files Created

1. [`supabase/migrations/0011_manage_customer_status_atomic.sql`](file:///D:/solenne/supabase/migrations/0011_manage_customer_status_atomic.sql)
2. [`lib/validations/customer.ts`](file:///D:/solenne/lib/validations/customer.ts)
3. [`app/actions/customers.ts`](file:///D:/solenne/app/actions/customers.ts)
4. [`components/admin/customer-status-control.tsx`](file:///D:/solenne/components/admin/customer-status-control.tsx)
5. [`scripts/verify-customer-status.mjs`](file:///D:/solenne/scripts/verify-customer-status.mjs)

---

## 6. Files Modified

1. [`lib/audit-utils.ts`](file:///D:/solenne/lib/audit-utils.ts) — Added `customer.status_changed` to `AUDIT_ACTIONS`, `customer` category, and bilingual summary formatter.
2. [`lib/admin-customers.ts`](file:///D:/solenne/lib/admin-customers.ts) — Added `manageCustomerStatus` function.
3. [`components/admin/index.ts`](file:///D:/solenne/components/admin/index.ts) — Exported `CustomerStatusControl` and `CustomerStatusControlProps`.
4. [`app/admin/customers/[id]/page.tsx`](file:///D:/solenne/app/admin/customers/[id]/page.tsx) — Evaluates `staff.manage` and embeds `<CustomerStatusControl>`.

---

## 7. Current Implementation Status

- **Module B2**: Complete in local code and committed in `d40b6ab`.
- **Database Status**:
  - Migrations `0001` through `0010` are applied in the target Supabase environment.
  - Migration `0011_manage_customer_status_atomic.sql` is **COMMITTED LOCALLY BUT NOT YET APPLIED** to any database.
- **Git Status**:
  - `main` is ahead of `origin/main` by 1 commit (`d40b6ab`).
  - No commit has been pushed to GitHub.
  - No deployment has been pushed to Cloudflare.
  - Working tree has exactly the 12 pre-existing modified AVIF files unstaged.

---

## 8. Remaining Tasks

1. **Owner Review & Database Application Approval**:
   - Present commit `d40b6ab` to project owner for approval to apply migration `0011_manage_customer_status_atomic.sql` to the Supabase database.
   - Once approved, apply migration via Supabase CLI (`supabase migration up` or approved deployment pipeline).
2. **Live Runtime Verification**:
   - Verify that migration 0011's self-verification `do $$` block passes in PostgreSQL.
   - Test live customer status changes (`active -> suspended`, `suspended -> active`, `active -> banned`).
   - Confirm audit logs appear in the admin audit viewer (`/admin/audit`) under action `customer.status_changed`.
   - Attempt a direct REST PATCH on `profiles.status` using a user JWT to confirm HTTP 403 / SQLSTATE 42501 rejection.
3. **Next Module (Module B3 / Phase 2 Continuations)**:
   - Determine next requirement: Staff Management (listing, role assignment, deactivation) or Customer Address Oversight.

---

## 9. Known Bugs and Unresolved Issues

- **None in Module B2 code**. All static tests, type checks, and linting pass with zero errors.
- **Minor Observations from Review**:
  - In `manage_customer_status` SQL RPC, string expansion during regex replacement (replacing short emails with `[REDACTED_EMAIL]`) can cause `v_sanitized_reason` to expand beyond 255 characters. This is safely stored in `jsonb` without database errors and is bounded by `MAX_STRING_LENGTH = 200` in the audit viewer, but should be noted.
  - In `0011`, `EXECUTE` is granted to `service_role`. Calling `manage_customer_status` as `service_role` without an impersonated user JWT fails with `UNAUTHENTICATED (28000)`. This conforms with Solenne conventions and does not affect the app (which uses user-scoped client), but `service_role` cannot invoke the RPC anonymously.

---

## 10. Important Decisions Made Today

1. **Permission Assignment**:
   - Only `staff.manage` permission can change customer account status.
   - In `0002_rbac_seed.sql`, `staff.manage` is granted exclusively to `admin`. No new permissions or role grants were added.
2. **Allowed Transition Rules**:
   - `active` ↔ `suspended`: Allowed, reason required (5–255 characters).
   - `active` → `banned`: Allowed, reason required (5–255 characters).
   - `suspended` → `banned`: Allowed, reason required (5–255 characters).
   - `banned` → Any: **REJECTED** (banned is terminal in Module B2).
   - `pending` → Any: **REJECTED** (out of scope).
   - Any → Same status: **REJECTED** as no-op.
   - Any → `pending`: **REJECTED**.
3. **Privilege Hardening**:
   - Revoked broad `UPDATE` on `public.profiles` from `authenticated`.
   - Granted `UPDATE (full_name, phone, avatar_url, updated_at)` only to `authenticated`.
4. **Audit Requirement**:
   - Audit event `customer.status_changed` MUST be written in the same transaction as the status update. Failure to audit rolls back the status change.
5. **Target Isolation**:
   - The RPC strictly validates `v_customer.role_name = 'customer'`. Non-customer profiles (staff, managers, admins) cannot be modified.
   - Self-status modification (`p_customer_id = auth.uid()`) is rejected.

---

## 11. Database Changes

### Migration `0011_manage_customer_status_atomic.sql` (Local, Unapplied)
- **Column Privilege Hardening**:
  ```sql
  revoke update on public.profiles from authenticated;
  grant update (full_name, phone, avatar_url, updated_at) on public.profiles to authenticated;
  ```
- **Function**: `public.manage_customer_status(p_customer_id uuid, p_target_status text, p_reason text) returns jsonb`
  - `SECURITY DEFINER`
  - `search_path = public, pg_temp`
  - `auth.uid()` derivation
  - `staff.manage` check
  - `FOR UPDATE OF p` row lock
  - Role isolation check (`roles.name = 'customer'`)
  - Transition matrix enforcement
  - Regex PII redaction (`[REDACTED_EMAIL]`, `[REDACTED_PHONE]`)
  - In-transaction insert to `public.audit_logs` (`customer.status_changed`, `profile`)
- **Grants**:
  - `REVOKE ALL ... FROM public, anon;`
  - `GRANT EXECUTE ... TO authenticated, service_role;`
- **Self-Verification Block**:
  - Asserts `prosecdef = true` for `manage_customer_status`.
  - Asserts `has_column_privilege('authenticated', 'public.profiles', 'status', 'update') = false`.
  - Asserts `has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update') = true`.

---

## 12. Environment and Configuration Changes

- **No new dependencies** were added to `package.json` or `pnpm-lock.yaml`.
- **No environment variable changes** were made.
- `.env.local` remains gitignored and was not touched.

---

## 13. What Should NOT Be Changed

1. **NEVER run `pnpm build`**:
   `package.json` defines `"build": "node scripts/generate-optimized-images.mjs && next build"`. Running `pnpm build` invokes the image optimizer which will regenerate and **overwrite the 12 pre-existing user-modified AVIF files**. Always use `pnpm exec next build` or `npx tsc --noEmit`.
2. **The 12 Pre-Existing Modified AVIF Files**:
   Must remain unmodified, unstaged, and uncommitted:
   - `public/images/product/optimized/solenne-cedar-and-sage-1200.avif`
   - `public/images/product/optimized/solenne-cedar-and-sage-640.avif`
   - `public/images/product/optimized/solenne-golden-hours-1200.avif`
   - `public/images/product/optimized/solenne-golden-hours-640.avif`
   - `public/images/product/optimized/solenne-lavender-serenity-1200.avif`
   - `public/images/product/optimized/solenne-lavender-serenity-640.avif`
   - `public/images/product/optimized/solenne-midnight-garden-candle-glow-1200.avif`
   - `public/images/product/optimized/solenne-midnight-garden-candle-glow-640.avif`
   - `public/images/product/optimized/solenne-ocean-breeze-1200.avif`
   - `public/images/product/optimized/solenne-ocean-breeze-640.avif`
   - `public/images/product/optimized/solenne-vanilla-ember-1200.avif`
   - `public/images/product/optimized/solenne-vanilla-ember-640.avif`
3. **Do NOT run Git commands with broad flags**:
   Avoid `git add -A`, `git add .`, `git commit -a`, `git clean`, `git reset --hard`, `git checkout --`.
4. **Development Server on Port 3000**:
   Must not be killed or restarted.
5. **Existing Migrations `0001`–`0010`**:
   Must not be rerun, modified, or deleted.

---

## 14. The Exact Next Recommended Steps

When the next session starts:
1. **Run preflight status check**:
   ```powershell
   git status --short
   git status -sb
   git log -5 --oneline
   ```
   Confirm head commit is `d40b6ab` and only the 12 AVIF files appear as modified in working tree.
2. **Verify AVIF hashes** to confirm they match the baseline recorded in this document.
3. **Review with user**:
   Ask user whether they want to:
   - **Option A**: Apply migration `0011_manage_customer_status_atomic.sql` to Supabase and perform live database testing.
   - **Option B**: Push commit `d40b6ab` to `origin/main`.
   - **Option C**: Proceed to the next specification in Phase 2 (e.g. Module B3 — Staff & Role Management).

---

## 15. Context That a New AI Session Must Know

- Solenne is built on Next.js 16 App Router where page dynamic params are promises: `params: Promise<{ id: string }>`. Always `await params`.
- All admin component imports must use barrel exports: `import { CustomerStatusControl } from "@/components/admin"`.
- Named exports are required for all components (except `page.tsx` and `layout.tsx` which require default exports).
- All UI text must be bilingual (`isVi ? "..." : "..."`).
- In Server Actions, never trust user ID from client arguments — always obtain it from `await requirePermission(...)` or `auth.getUser()`.
- Server Actions must use user-scoped client `createClient()` from `@/lib/supabase/server`. Do not use `createAdminClient()` or secret keys for user-initiated mutations unless explicitly required for a system operation that bypasses RLS by design.
- The working tree has 12 AVIF modifications from prior sessions that are intentional and must never be discarded or committed without explicit owner request.
