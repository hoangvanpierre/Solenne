-- ===================================================
-- Solenne RBAC — 0002: seed roles, permissions, matrix
-- ===================================================
-- Idempotent: safe to re-run. Touches only the RBAC catalogue and backfills
-- profiles that have no role yet. It never modifies auth.users, orders,
-- products, addresses or any existing profile field.
--
-- Roles are matched by `name` (the stable identifier), so re-running never
-- duplicates or re-keys them.
--
-- DELIBERATE OMISSION: the settings.read / settings.manage permissions from the
-- original matrix are NOT seeded, because Solenne has no settings feature for
-- them to guard. A permission that guards nothing invites false confidence. They
-- are additive later: insert the two permission rows and grant them to `admin`.

-- ---------- roles ----------
insert into public.roles (name, description, rank) values
  ('customer', 'Storefront shopper. Own orders and own profile only.', 10),
  ('staff',    'Operations. Catalogue maintenance, order handling, inventory.', 20),
  ('manager',  'Staff plus deletes, analytics, staff visibility and cancellations.', 30),
  ('admin',    'Full administrative authority, including roles and audit logs.', 40)
on conflict (name) do update
  set description = excluded.description,
      rank = excluded.rank,
      updated_at = now();

-- ---------- permissions (explicit, no wildcards) ----------
insert into public.permissions (key, description) values
  ('product.read',        'View products and variants, including inactive/draft ones'),
  ('product.create',      'Create products and variants'),
  ('product.update',      'Edit products and variants'),
  ('product.delete',      'Delete or unpublish products'),
  ('order.read',          'Read any customer order'),
  ('order.read_own',      'Read your own orders'),
  ('order.create',        'Place an order'),
  ('order.update',        'Edit order details or status'),
  ('order.cancel',        'Cancel an order'),
  ('inventory.read',      'View stock levels'),
  ('inventory.update',    'Adjust stock levels'),
  ('customer.read',       'View customer profiles and contact details'),
  ('customer.update',     'Edit customer profiles'),
  ('analytics.read',      'View store analytics and reports'),
  ('staff.read',          'View staff accounts and their roles'),
  ('staff.manage',        'Suspend, ban or reactivate accounts'),
  ('role.read',           'View roles and the permission matrix'),
  ('role.manage',         'Assign roles and change role permissions'),
  ('audit.read',          'Read the security audit log'),
  ('profile.read_own',    'Read your own profile'),
  ('profile.update_own',  'Edit your own profile')
on conflict (key) do update
  set description = excluded.description;

-- ---------- role -> permission matrix ----------
-- Rebuilt from scratch for the four system roles so the file stays the single
-- source of truth for the matrix. Only role_permissions rows are replaced; no
-- user data is touched.
delete from public.role_permissions
where role_id in (select id from public.roles where name in ('customer', 'staff', 'manager', 'admin'));

with matrix(role_name, perm_key) as (
  values
    -- customer
    ('customer', 'product.read'),
    ('customer', 'order.create'),
    ('customer', 'order.read_own'),
    ('customer', 'profile.read_own'),
    ('customer', 'profile.update_own'),
    -- staff
    ('staff', 'product.read'),
    ('staff', 'product.create'),
    ('staff', 'product.update'),
    ('staff', 'order.read'),
    ('staff', 'order.update'),
    ('staff', 'inventory.read'),
    ('staff', 'inventory.update'),
    ('staff', 'customer.read'),
    ('staff', 'profile.read_own'),
    ('staff', 'profile.update_own'),
    -- manager (everything staff has, plus:)
    ('manager', 'product.read'),
    ('manager', 'product.create'),
    ('manager', 'product.update'),
    ('manager', 'product.delete'),
    ('manager', 'order.read'),
    ('manager', 'order.update'),
    ('manager', 'order.cancel'),
    ('manager', 'inventory.read'),
    ('manager', 'inventory.update'),
    ('manager', 'customer.read'),
    ('manager', 'analytics.read'),
    ('manager', 'staff.read'),
    ('manager', 'profile.read_own'),
    ('manager', 'profile.update_own'),
    -- admin (full)
    ('admin', 'product.read'),
    ('admin', 'product.create'),
    ('admin', 'product.update'),
    ('admin', 'product.delete'),
    ('admin', 'order.read'),
    ('admin', 'order.read_own'),
    ('admin', 'order.create'),
    ('admin', 'order.update'),
    ('admin', 'order.cancel'),
    ('admin', 'inventory.read'),
    ('admin', 'inventory.update'),
    ('admin', 'customer.read'),
    ('admin', 'customer.update'),
    ('admin', 'analytics.read'),
    ('admin', 'staff.read'),
    ('admin', 'staff.manage'),
    ('admin', 'role.read'),
    ('admin', 'role.manage'),
    ('admin', 'audit.read'),
    ('admin', 'profile.read_own'),
    ('admin', 'profile.update_own')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from matrix m
join public.roles r on r.name = m.role_name
join public.permissions p on p.key = m.perm_key
on conflict (role_id, permission_id) do nothing;

-- ===================================================
-- Backfill + lock down profiles.role_id
-- ===================================================
-- Existing users become `customer`. Their authentication is untouched and stays
-- valid. An existing administrative account is deliberately NOT guessed here —
-- promote it explicitly with 0004_bootstrap_admin.sql.
update public.profiles
set role_id = public.default_role_id()
where role_id is null;

alter table public.profiles
  alter column role_id set default public.default_role_id();

alter table public.profiles
  alter column role_id set not null;

-- ===================================================
-- Self-verification: fail loudly instead of half-applying
-- ===================================================
do $$
declare
  n_roles int;
  n_perms int;
  n_customer int;
  n_staff int;
  n_manager int;
  n_admin int;
  n_roleless int;
begin
  select count(*) into n_roles from public.roles;
  if n_roles < 4 then
    raise exception 'RBAC seed incomplete: expected >= 4 roles, found %', n_roles;
  end if;

  select count(*) into n_perms from public.permissions;
  if n_perms < 21 then
    raise exception 'RBAC seed incomplete: expected >= 21 permissions, found %', n_perms;
  end if;

  select count(*) into n_roleless from public.profiles where role_id is null;
  if n_roleless > 0 then
    raise exception 'RBAC seed incomplete: % profile(s) still have no role', n_roleless;
  end if;

  select count(*) into n_customer from public.role_permissions rp
    join public.roles r on r.id = rp.role_id where r.name = 'customer';
  select count(*) into n_staff from public.role_permissions rp
    join public.roles r on r.id = rp.role_id where r.name = 'staff';
  select count(*) into n_manager from public.role_permissions rp
    join public.roles r on r.id = rp.role_id where r.name = 'manager';
  select count(*) into n_admin from public.role_permissions rp
    join public.roles r on r.id = rp.role_id where r.name = 'admin';

  if n_customer <> 5 or n_staff <> 10 or n_manager <> 14 or n_admin <> 21 then
    raise exception 'RBAC matrix mismatch: customer=% staff=% manager=% admin=% (expected 5/10/14/21)',
      n_customer, n_staff, n_manager, n_admin;
  end if;

  raise notice 'RBAC 0002 OK - roles=%, permissions=%, matrix=%/%/%/%',
    n_roles, n_perms, n_customer, n_staff, n_manager, n_admin;
end $$;

