-- ===================================================
-- Solenne RBAC — 0005: security-foundation hardening
-- ===================================================
-- Apply after 0001–0004. Non-destructive: it adds privileges, removes the
-- policies that were escalation paths, and then verifies the end state loudly.
--
-- Why this file exists (found while migrating the app off the secret key):
--   1. 0003 granted `insert` on public.profiles and created profiles_insert_own.
--      A profile row is only ever created by the SECURITY DEFINER trigger on
--      auth.users (0001), so that policy has no legitimate caller — and because
--      the privilege guard trigger only fires on UPDATE, a user whose profile
--      row was missing could INSERT one and pick their own role_id (e.g. admin).
--      Closing it costs nothing and removes the hole.
--   2. service_role bypasses RLS but NOT table privileges. Without explicit
--      grants, the server-side audit writer (lib/audit.ts) and any future
--      staff-management action fail with 42501 on the RBAC tables.
--   3. The pre-RBAC dashboard schema still carried four `FOR ALL` policies on
--      user data (`own profile`, `own orders`, `Users can manage their own
--      addresses`, `own address`). 0003's per-verb policies supersede them, and
--      on `orders` the catch-all met the UPDATE grant 0003 issues to
--      `authenticated` — a customer could rewrite their own order. Section 1b
--      retires them; check 3d keeps them from returning.

-- ===================================================
-- 1. Close the profiles INSERT escalation path
-- ===================================================
drop policy if exists profiles_insert_own on public.profiles;
revoke insert on public.profiles from authenticated;

-- ===================================================
-- 1b. Retire the legacy `FOR ALL` policies on user data
-- ===================================================
-- 0003 replaced these dashboard-authored catch-alls with one policy per verb, so
-- leaving them in place is duplication — except on `orders`, where `own orders`
-- (FOR ALL, auth.uid() = user_id) meets the UPDATE grant 0003 hands to
-- `authenticated`, and a customer could then rewrite their own order (total,
-- status, discount) straight through PostgREST. No user-scoped UPDATE or DELETE
-- on orders exists anywhere in this app: every order write is a server action.
--
-- Removed by discovery, exactly like 0003 did for the broken order_items INSERT
-- policy, so this does not depend on the names a dashboard happened to pick (on
-- this database: profiles `own profile`; orders `own orders`; addresses
-- `Users can manage their own addresses` and `own address`). Each removal prints
-- its full definition — the migration output is the review record — and check 3d
-- below fails if one ever comes back.
do $$
declare
  pol record;
  dropped int := 0;
begin
  for pol in
    select tablename, policyname, roles as applies_to, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'orders', 'order_items', 'addresses')
      and cmd = 'ALL'
    order by tablename, policyname
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
    dropped := dropped + 1;
    raise notice 'Dropped legacy FOR ALL policy: %.% [roles: %] using (%) with check (%)',
      pol.tablename, pol.policyname, array_to_string(pol.applies_to, ','),
      coalesce(pol.qual, '-'), coalesce(pol.with_check, '-');
  end loop;

  if dropped = 0 then
    raise notice 'No legacy FOR ALL policy left on user data.';
  end if;
end $$;

-- ===================================================
-- 2. Privileges for the trusted server path
-- ===================================================
-- The audit trail is written ONLY by the trusted server path (service_role,
-- after an explicit permission check — see lib/audit.ts and lib/orders.ts).
-- 0003 let `authenticated` insert its own rows; since action/resource_type are
-- free text, that would let a customer forge entries, so it is removed here.
drop policy if exists audit_logs_insert_own on public.audit_logs;
revoke insert on public.audit_logs from authenticated;

-- Append-only audit trail: the trusted path may INSERT, never rewrite.
grant select, insert on public.audit_logs to service_role;
revoke update, delete on public.audit_logs from service_role;

grant select on public.roles,
                public.permissions,
                public.role_permissions to service_role;

grant select, insert, update, delete on public.profiles,
                                        public.orders,
                                        public.addresses,
                                        public.products,
                                        public.product_variants to service_role;

grant select, insert on public.order_items to service_role;

-- ===================================================
-- 2b. Catalog writes stay on the trusted server path
-- ===================================================
-- products / product_variants are read by the anonymous storefront and are
-- written only by trusted server code (the seed script today, permission-gated
-- admin actions later) — never by a signed-in browser. RLS is still disabled on
-- these two tables (0003 explains why), so table privileges are the only gate:
-- leaving INSERT/UPDATE/DELETE with `authenticated` would let ANY logged-in
-- user rewrite prices and stock straight through PostgREST. Reads stay public.
grant select on public.products, public.product_variants to anon, authenticated;
revoke insert, update, delete on public.products, public.product_variants
  from anon, authenticated;

-- ===================================================
-- 3. Self-verification — fail loudly instead of half-applying
-- ===================================================
do $$
declare
  t            text;
  n            int;
  rls_off      text := '';
  bad_name     text;
  all_policies text := '';
begin
  -- 3a. RLS must be ON for every private table.
  foreach t in array array[
    'profiles', 'orders', 'order_items', 'addresses',
    'roles', 'permissions', 'role_permissions', 'audit_logs'
  ]
  loop
    select count(*) into n from pg_class
      where oid = ('public.' || t)::regclass and relrowsecurity;
    if n = 0 then
      rls_off := rls_off || t || ' ';
    end if;
  end loop;
  if rls_off <> '' then
    raise exception 'RLS is not enabled on: %', rls_off;
  end if;

  -- 3b. No INSERT policy may remain on profiles (see section 1).
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd = 'INSERT';
  if n > 0 then
    raise exception 'profiles still has % INSERT policy/policies', n;
  end if;

  -- 3c. order_items must have exactly one INSERT policy — the ownership-based
  -- one. A legacy permissive policy here would let any authenticated user add
  -- items to another customer's order.
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'order_items' and cmd = 'INSERT';
  if n <> 1 then
    raise exception 'order_items must have exactly 1 INSERT policy, found %', n;
  end if;
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'order_items'
      and cmd = 'INSERT' and policyname = 'order_items_insert_own';
  if n <> 1 then
    raise exception 'order_items_insert_own is missing or misnamed';
  end if;


  -- 3d. A `FOR ALL` policy on user data is the dangerous legacy shape: it
  -- widens UPDATE/DELETE (e.g. letting a customer edit or delete their own
  -- financial record). Fail so an operator removes it deliberately instead of
  -- inheriting it silently. Section 1b has already retired the four known ones
  -- (profiles/orders/addresses); this check stays as a regression guard.
  foreach t in array array['profiles', 'orders', 'order_items', 'addresses']
  loop
    select string_agg(policyname, ', ') into bad_name from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'ALL';
    if bad_name is not null then
      all_policies := all_policies || t || ' [' || bad_name || '] ';
    end if;
  end loop;
  if all_policies <> '' then
    raise exception 'FOR ALL policy found on user data (review before applying): %', all_policies;
  end if;

  -- 3e. audit_logs is append-only: no UPDATE/DELETE policy may exist for any
  -- role, the trusted path must be able to append, and it must not be able to
  -- erase.
  select count(*) into n from pg_policies
    where schemaname = 'public' and tablename = 'audit_logs'
      and cmd in ('UPDATE', 'DELETE');
  if n > 0 then
    raise exception 'audit_logs must not have UPDATE/DELETE policies, found %', n;
  end if;
  if not has_table_privilege('service_role', 'public.audit_logs', 'INSERT') then
    raise exception 'service_role cannot INSERT audit_logs';
  end if;
  if has_table_privilege('service_role', 'public.audit_logs', 'DELETE') then
    raise exception 'service_role must not be able to DELETE audit_logs';
  end if;
  if has_table_privilege('authenticated', 'public.profiles', 'INSERT') then
    raise exception 'authenticated must not have INSERT on profiles';
  end if;
  if has_table_privilege('authenticated', 'public.audit_logs', 'INSERT') then
    raise exception 'authenticated must not have INSERT on audit_logs (forgery path)';
  end if;

  -- 3g. The catalog stays publicly readable and server-write-only.
  if not has_table_privilege('anon', 'public.products', 'SELECT') then
    raise exception 'anon must be able to SELECT products (storefront)';
  end if;
  if not has_table_privilege('authenticated', 'public.product_variants', 'SELECT') then
    raise exception 'authenticated must be able to SELECT product_variants (checkout re-prices from them)';
  end if;
  if has_table_privilege('authenticated', 'public.products', 'UPDATE') then
    raise exception 'authenticated must not be able to UPDATE products';
  end if;
  if has_table_privilege('authenticated', 'public.product_variants', 'UPDATE') then
    raise exception 'authenticated must not be able to UPDATE product_variants';
  end if;

  -- 3f. Informational: the full policy set, for the operator's eyeball.
  raise notice '--- RBAC 0005 OK ---';
  raise notice 'policies: %', (
    select string_agg(tablename || ':' || policyname || '(' || cmd || ')', ' | '
                      order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'orders', 'order_items', 'addresses',
                        'roles', 'permissions', 'role_permissions', 'audit_logs')
  );
end $$;

