-- ===================================================
-- Solenne RBAC — 0003: RLS policies + grants
-- ===================================================
-- Apply after 0001 and 0002.
--
-- This migration turns RLS into a REAL second layer. Today every order, address
-- and profile read/write in the app runs through the secret-key client
-- (service_role), which bypasses RLS entirely — so RLS protects nothing on those
-- tables. After this migration the application is migrated to the user-scoped
-- client, and these policies become the enforcement point.
--
-- SAFE FOR EXISTING BEHAVIOUR:
--  * service_role bypasses RLS, so nothing the app does today starts failing
--    because of this file.
--  * anon holds no privileges on the private tables today and keeps none.
--  * every policy below is scoped `to authenticated`; anon access is unchanged.
--
-- products / product_variants are handled specially at the end: RLS is NOT
-- enabled there (that could break the public storefront, whose existing read
-- policy cannot be inspected from here), so no authenticated write grants are
-- handed out either. Product writes stay on the trusted server path for now.

-- ---------- enable RLS ----------
alter table public.profiles         enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.addresses        enable row level security;
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs       enable row level security;

-- ===================================================
-- profiles
-- ===================================================
-- Row scope is enforced here; COLUMN-level authority (who may change role_id or
-- status) is enforced by the guard trigger in 0001. RLS cannot express "these
-- columns only", so the two mechanisms are complementary.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists profiles_select_with_customer_read on public.profiles;
create policy profiles_select_with_customer_read on public.profiles
  for select to authenticated
  using (public.has_permission('customer.read'));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_update_with_customer_update on public.profiles;
create policy profiles_update_with_customer_update on public.profiles
  for update to authenticated
  using (public.has_permission('customer.update'))
  with check (public.has_permission('customer.update'));

drop policy if exists profiles_update_with_staff_manage on public.profiles;
create policy profiles_update_with_staff_manage on public.profiles
  for update to authenticated
  using (public.has_permission('staff.manage'))
  with check (public.has_permission('staff.manage'));

drop policy if exists profiles_update_with_role_manage on public.profiles;
create policy profiles_update_with_role_manage on public.profiles
  for update to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

-- ===================================================
-- orders — customers see only their own; staff read by permission
-- ===================================================
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists orders_select_with_order_read on public.orders;
create policy orders_select_with_order_read on public.orders
  for select to authenticated
  using (public.has_permission('order.read'));

-- A customer may only open an order for themselves, and only in the initial
-- state. Price integrity is recomputed server-side from product_variants; the
-- client only ever sends {variantId, quantity}.
drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists orders_update_with_order_update on public.orders;
create policy orders_update_with_order_update on public.orders
  for update to authenticated
  using (public.has_permission('order.update') or public.has_permission('order.cancel'))
  with check (public.has_permission('order.update') or public.has_permission('order.cancel'));

-- No DELETE policy: orders are financial records and are never deleted.

-- ===================================================
-- order_items — this is the policy that was misconfigured
-- ===================================================
-- The pre-existing INSERT policy rejected legitimate customer inserts ("new row
-- violates the policy"), which is exactly why the app was forced onto the secret
-- key. It is dropped by name-less discovery so the fix does not depend on
-- knowing what the broken policy was called.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'order_items' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.order_items', pol.policyname);
    raise notice 'Dropped legacy order_items INSERT policy: %', pol.policyname;
  end loop;
end $$;

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

drop policy if exists order_items_select_with_order_read on public.order_items;
create policy order_items_select_with_order_read on public.order_items
  for select to authenticated
  using (public.has_permission('order.read'));

drop policy if exists order_items_insert_own on public.order_items;
create policy order_items_insert_own on public.order_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- ===================================================
-- addresses — strictly user-owned
-- ===================================================
drop policy if exists addresses_select_own on public.addresses;
create policy addresses_select_own on public.addresses
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists addresses_select_with_customer_read on public.addresses;
create policy addresses_select_with_customer_read on public.addresses
  for select to authenticated
  using (public.has_permission('customer.read'));

drop policy if exists addresses_insert_own on public.addresses;
create policy addresses_insert_own on public.addresses
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists addresses_update_own on public.addresses;
create policy addresses_update_own on public.addresses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists addresses_delete_own on public.addresses;
create policy addresses_delete_own on public.addresses
  for delete to authenticated
  using (user_id = auth.uid());

-- ===================================================
-- roles / permissions / role_permissions
-- ===================================================
-- Reading the catalogue:
--  * role.read  -> the full matrix (admin)
--  * staff.read -> role names/ranks, so /admin/staff can render a role column
drop policy if exists roles_select_with_role_read on public.roles;
create policy roles_select_with_role_read on public.roles
  for select to authenticated
  using (public.has_permission('role.read'));

drop policy if exists roles_select_with_staff_read on public.roles;
create policy roles_select_with_staff_read on public.roles
  for select to authenticated
  using (public.has_permission('staff.read'));

drop policy if exists permissions_select_with_role_read on public.permissions;
create policy permissions_select_with_role_read on public.permissions
  for select to authenticated
  using (public.has_permission('role.read'));

drop policy if exists role_permissions_select_with_role_read on public.role_permissions;
create policy role_permissions_select_with_role_read on public.role_permissions
  for select to authenticated
  using (public.has_permission('role.read'));

-- Managing the catalogue requires role.manage (admin only in the seed).
drop policy if exists roles_write_with_role_manage on public.roles;
create policy roles_write_with_role_manage on public.roles
  for all to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

drop policy if exists permissions_write_with_role_manage on public.permissions;
create policy permissions_write_with_role_manage on public.permissions
  for all to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

drop policy if exists role_permissions_write_with_role_manage on public.role_permissions;
create policy role_permissions_write_with_role_manage on public.role_permissions
  for all to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage'));

-- ===================================================
-- audit_logs — append-only
-- ===================================================
-- There is deliberately NO update or delete policy: with RLS enabled and no
-- permissive policy for those commands, they are impossible for any
-- authenticated caller, and the grants are revoked below as well.
-- An audit row always records the REAL actor: actor_id must be the caller.
drop policy if exists audit_logs_insert_own on public.audit_logs;
create policy audit_logs_insert_own on public.audit_logs
  for insert to authenticated
  with check (actor_id = auth.uid());

drop policy if exists audit_logs_select_with_audit_read on public.audit_logs;
create policy audit_logs_select_with_audit_read on public.audit_logs
  for select to authenticated
  using (public.has_permission('audit.read'));

-- ===================================================
-- Grants
-- ===================================================
-- RLS is the gate; grants only make the tables reachable at all. The app
-- currently reaches them as service_role, so nothing here changes today's
-- behaviour — these grants are what let the user-scoped client work once the
-- data layer is migrated.
grant select, insert, update         on public.profiles         to authenticated;
grant select, insert, update         on public.orders           to authenticated;
grant select, insert                 on public.order_items      to authenticated;
grant select, insert, update, delete on public.addresses        to authenticated;
grant select, insert, update, delete on public.roles            to authenticated;
grant select, insert, update, delete on public.permissions      to authenticated;
grant select, insert, update, delete on public.role_permissions to authenticated;
grant select, insert                 on public.audit_logs       to authenticated;

-- Append-only / immutability enforcement, in addition to the absent policies.
revoke update, delete on public.audit_logs  from authenticated;
revoke delete          on public.orders      from authenticated;
revoke delete          on public.order_items from authenticated;

-- ===================================================
-- products / product_variants — conditional, do no harm
-- ===================================================
-- These two tables are read by the PUBLIC storefront. Their existing read policy
-- cannot be inspected from here, so enabling RLS or granting writes blindly could
-- either break anonymous browsing or open unrestricted writes to every logged-in
-- user. Writes are granted ONLY when RLS is already enabled; otherwise product
-- writes stay on the trusted server path.
do $$
declare
  products_rls boolean;
  variants_rls boolean;
begin
  select relrowsecurity into products_rls from pg_class
    where oid = 'public.products'::regclass;
  select relrowsecurity into variants_rls from pg_class
    where oid = 'public.product_variants'::regclass;

  if products_rls and variants_rls then
    grant select, insert, update, delete on public.products         to authenticated;
    grant select, insert, update, delete on public.product_variants to authenticated;

    drop policy if exists products_select_with_product_read on public.products;
    create policy products_select_with_product_read on public.products
      for select to authenticated
      using (public.has_permission('product.read'));

    drop policy if exists products_insert_with_product_create on public.products;
    create policy products_insert_with_product_create on public.products
      for insert to authenticated
      with check (public.has_permission('product.create'));

    drop policy if exists products_update_with_product_update on public.products;
    create policy products_update_with_product_update on public.products
      for update to authenticated
      using (public.has_permission('product.update'))
      with check (public.has_permission('product.update'));

    drop policy if exists products_delete_with_product_delete on public.products;
    create policy products_delete_with_product_delete on public.products
      for delete to authenticated
      using (public.has_permission('product.delete'));

    drop policy if exists product_variants_select_with_product_read on public.product_variants;
    create policy product_variants_select_with_product_read on public.product_variants
      for select to authenticated
      using (public.has_permission('product.read'));

    drop policy if exists product_variants_write_with_permission on public.product_variants;
    create policy product_variants_write_with_permission on public.product_variants
      for all to authenticated
      using (
        public.has_permission('product.update')
        or public.has_permission('inventory.update')
      )
      with check (
        public.has_permission('product.update')
        or public.has_permission('inventory.update')
      );

    raise notice 'products/product_variants: RLS detected - admin write grants + policies applied.';
  else
    raise warning 'products/product_variants: RLS is NOT enabled (products=%, variants=%). Skipped write grants so no authenticated user can write unrestricted rows. Enable RLS with an appropriate read policy before moving product CRUD onto the user-scoped client.',
      products_rls, variants_rls;
  end if;
end $$;

-- ===================================================
-- Self-verification
-- ===================================================
do $$
declare
  t text;
  missing text[] := '{}';
  legacy_insert int;
begin
  foreach t in array array[
    'profiles', 'orders', 'order_items', 'addresses',
    'roles', 'permissions', 'role_permissions', 'audit_logs'
  ]
  loop
    if not exists (
      select 1 from pg_class
      where oid = ('public.' || t)::regclass and relrowsecurity
    ) then
      missing := missing || t;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'RLS is not enabled on: %', array_to_string(missing, ', ');
  end if;

  -- The misconfigured order_items INSERT policy must be gone.
  select count(*) into legacy_insert
  from pg_policies
  where schemaname = 'public'
    and tablename = 'order_items'
    and cmd = 'INSERT'
    and policyname <> 'order_items_insert_own';

  if legacy_insert > 0 then
    raise exception 'A legacy order_items INSERT policy survived: %', legacy_insert;
  end if;

  raise notice 'RBAC 0003 OK - RLS enabled on 8 tables, policies applied, order_items repaired';
end $$;


