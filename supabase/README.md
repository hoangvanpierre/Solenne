# Solenne — RBAC database layer

Migrations for the role-based access control system. **Source of truth for
authorization is the database**: `profiles.role_id → roles → role_permissions →
permissions`. Application code and UI only mirror it.

## Apply order

| # | File | What it does |
|---|---|---|
| 0001 | `0001_rbac_schema.sql` | `roles`, `permissions`, `role_permissions`, `audit_logs`; adds nullable `profiles.role_id` + `profiles.status`; helper functions; `handle_new_user` + privilege-escalation/last-admin triggers |
| 0002 | `0002_rbac_seed.sql` | Seeds the 4 roles and 21 permissions, rebuilds the role→permission matrix, backfills existing profiles to `customer`, then makes `role_id` `NOT NULL DEFAULT` |
| 0003 | `0003_rbac_rls.sql` | Enables RLS, creates every policy, hands out grants, repairs the broken `order_items` INSERT policy |
| 0004 | `0004_bootstrap_admin.sql` | **Operator-only, not part of the chain.** One-time bootstrap that promotes exactly one account you name to `admin`; ships inert (`v_email = null`) |
| 0005 | `0005_rbac_security_foundation.sql` | Drops the `profiles` INSERT escalation policy, moves audit/catalog writes onto the `service_role` grants the app needs, and retires the four legacy `FOR ALL` policies on user data (see decision 7) |

**0001, 0002, 0003 and 0005 are the schema/security chain** — apply them in
order. Each is idempotent (safe to re-run) and ends with a self-verification
block that raises an exception rather than half-applying.

**0004 is a one-time operator bootstrap step, not a schema migration.** It ships
inert (`v_email = null`), it is never part of an unattended apply, and it must
never carry a committed environment-specific admin email — see *Bootstrapping the
first administrator* below.

### Applying

**Option A — SQL Editor (works today).** Dashboard → SQL Editor → paste one file
→ Run. Do them in order, one at a time; each prints a `NOTICE` on success.

**Option B — Supabase CLI (recommended once available).** This directory already
uses the CLI's `supabase/migrations/*.sql` layout, so no restructuring is needed:

```bash
supabase link --project-ref <ref>   # needs the database password
supabase db push
```

Both options apply the **chain** (0001/0002/0003/0005). `0004` sits outside it:
it is run by hand, once, when you actually need it.

Run migrations as the **project owner** (`postgres`). The helpers in 0001 are
`SECURITY DEFINER` and rely on table-owner RLS bypass; if they were owned by a
lesser role, `has_permission()` inside a `profiles` policy would recurse.

## Bootstrapping the first administrator

Nothing is promoted automatically — not the first user, and not any hard-coded
email. 0004 is an operator step, outside the migration chain, so it is never
applied unattended. To create the initial admin:

1. `select id, email, created_at from auth.users order by created_at;`
2. Open `0004_bootstrap_admin.sql` and set `v_email` to that account **locally**,
   in your working copy only.
3. Run only that file, once. It writes a `user.role_changed` row to `audit_logs`
   (`actor_id` is null: an operator action has no authenticated actor).
4. Restore `v_email` to `null` and commit *that*. The committed file stays inert
   and never carries an environment-specific admin email.

Existing accounts were backfilled to `customer` by 0002, so any pre-existing
administrative account must be named here explicitly. With `v_email = null` the
file raises a `NOTICE` and returns, so the chain can be applied anywhere without
promoting anyone — or aborting on an account that does not exist yet.

## Verifying

```bash
node scripts/verify-rbac.mjs
```

Read-only: it uses the secret key from `.env.local` to inspect the catalogue and
the publishable key to prove what anonymous callers can and cannot reach. It
never writes. It reports FAIL while the chain (0001–0003 and 0005) has not been
applied yet. A
`--full` run is the only mode that creates anything: it makes disposable
customer/staff/manager/admin accounts plus one test order, then deletes them all.

Manual spot checks:

```sql
select name, rank from public.roles order by rank;
select r.name, count(*) from public.role_permissions rp
  join public.roles r on r.id = rp.role_id group by r.name order by r.name;
select relname, relrowsecurity from pg_class
  where relname in ('profiles','orders','order_items','addresses',
                    'roles','permissions','role_permissions','audit_logs');
```

## Deliberate decisions (please confirm)

1. **`settings.read` / `settings.manage` are not seeded.** Solenne has no
   settings feature, so those permissions would guard nothing. Adding them later
   is purely additive.
2. **`staff` cannot place orders** (`order.create` is customer/admin only). This
   follows the requested matrix literally; if staff should be able to buy
   candles, add `('staff','order.create')` to the matrix in 0002 and re-run it.
3. **Partially relaxed RLS:** `order_items` had no valid INSERT policy, so every
   order write bypassed RLS via the service key. 0003 repairs that policy; until
   the data layer is migrated to the user-scoped client, those writes still run
   as `service_role` and RLS is not yet the effective gate.
4. **`products` / `product_variants` keep their current RLS state.** Their read
   policy could not be inspected, so 0003 refuses to enable RLS or hand out write
   grants there unless RLS is *already* on. It raises a `WARNING` when it skips.
5. **Stock decrement stays on the trusted server path.** It is a system
   operation, not a user-delegated one, and customers must not hold
   `inventory.update`.
6. `audit_logs.actor_id` has **no** foreign key on purpose: audit rows must
   survive account deletion and must never block it.

7. **Four legacy `FOR ALL` policies on user data were retired by 0005.** The
   pre-RBAC dashboard schema still carried `profiles` → `own profile`, `orders` →
   `own orders`, and `addresses` → `Users can manage their own addresses` +
   `own address`, each `FOR ALL TO authenticated` scoped to the caller's own row
   (that is why 0005 first failed its own check 3d). 0003's per-verb policies
   supersede them, and on `orders` the catch-all additionally met the UPDATE
   grant 0003 issues to `authenticated` — a customer could have rewritten their
   own order's `total` or `status`. 0005 drops them by discovery, printing each
   definition, and check 3d fails if one ever returns.
8. **Partially relaxed RLS remains.** Stock decrement, the order-rollback delete
   and every audit write still run as `service_role` (granted by 0005), because
   they are system operations rather than user-delegated ones. RLS is not the
   effective gate for those three paths.
9. **Bootstrap configuration never lives in a committed file.** 0004 ships with
   `v_email = null`, so the chain applies anywhere without promoting an account
   or aborting on one that does not exist yet. The operator sets `v_email`
   locally, runs the file once, then restores `null` before committing.

## Rolling back

Nothing here drops or rewrites an existing column or row. To reverse 0001–0003:

```sql
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists profiles_guard_privileges on public.profiles;
alter table public.profiles drop column if exists role_id;   -- loses role assignments
alter table public.profiles drop column if exists status;
drop table if exists public.audit_logs;
drop table if exists public.role_permissions;
drop table if exists public.permissions;
drop table if exists public.roles;
```

To reverse 0005: revoke the grants it added to `service_role`, restore
`profiles_insert_own` and `audit_logs_insert_own` from 0003, and re-create the
four `FOR ALL` policies by hand only if you genuinely want customers able to
update (or delete) their own order and address rows.

Recreate the previous `order_items` INSERT policy if you intend to keep using the
service-key order path — 0003 removed it and replaced it with a working one.
