-- ===================================================
-- Solenne — 0014: Customer Wishlist
-- ===================================================
-- Apply after 0001–0013. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Persistence Surface:
--      The storefront heart on product cards and the product detail page used
--      to be purely visual. This migration adds the durable relation that
--      backs it, so a saved product survives reloads and devices.
--
--   2. Ownership Model (RLS is the enforcement point):
--      Every row belongs to exactly one authenticated account and is written
--      through the USER-SCOPED Supabase client (lib/supabase/server.ts), never
--      the secret-key admin client. RLS therefore has to be correct, because
--      it is the only thing standing between two customers' rows.
--        * SELECT  — own rows only
--        * INSERT  — own rows only (user_id must equal auth.uid())
--        * DELETE  — own rows only
--      There is deliberately NO `for all` policy and NO UPDATE policy: a
--      wishlist row is immutable except for being created or removed, so
--      ownership (user_id) and the product reference can never be rewritten
--      by a client, not even its own.
--
--   3. Active-Account Requirement:
--      All three policies additionally require public.is_active_account()
--      (from 0001). Suspending or banning an account therefore revokes
--      wishlist access in the database at the same moment it revokes every
--      other self-service permission, without an application deploy.
--
--   4. Least-Privilege Grants:
--      `anon` holds nothing at all — a guest can never create a row, and the
--      relation is not readable from the public API. `authenticated` holds
--      exactly SELECT, INSERT and DELETE (no UPDATE, no TRUNCATE, no
--      REFERENCES, no TRIGGER). `service_role` keeps the usual maintenance
--      privileges.
--
--   5. Deletion Behaviour:
--      Both foreign keys cascade. Deleting a profile removes that customer's
--      saved products; deleting a product removes every reference to it, so a
--      discontinued product can never leave a dangling wishlist row. The
--      `product_id` index supports the cascade and any admin-side lookup.
--
--   6. Idempotency:
--      The unique constraint on (user_id, product_id) is what makes the add
--      operation idempotent: a duplicate insert raises 23505, which
--      app/actions/wishlist.ts treats as "already saved" success instead of an
--      error. `if not exists` on every object keeps this file re-runnable.
-- ===================================================

-- ---------------------------------------------------------------------------
-- 0. Dependency check — the RLS policies call public.is_active_account()
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_active_account'
  ) then
    raise exception 'Migration 0014 requires public.is_active_account() from migration 0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null
    references public.profiles(id) on delete cascade on update cascade,
  product_id uuid not null
    references public.products(id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  constraint wishlist_items_user_product_key unique (user_id, product_id)
);

comment on table public.wishlist_items is
  'Per-customer saved products. Owned by auth.uid(); written through the user-scoped client so RLS is the enforcement point.';
comment on column public.wishlist_items.user_id is
  'Owner. Always auth.uid() at insert time; never accepted from client input.';
comment on column public.wishlist_items.product_id is
  'Saved product. Cascades on product deletion so no dangling rows remain.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
-- Serves the account wishlist listing (newest first) without a sort pass.
create index if not exists wishlist_items_user_created_idx
  on public.wishlist_items (user_id, created_at desc);

-- Serves the product-deletion cascade and per-product lookups.
create index if not exists wishlist_items_product_idx
  on public.wishlist_items (product_id);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.wishlist_items enable row level security;

-- Per-command, own-row policies. No `for all`, no UPDATE policy.
drop policy if exists wishlist_items_select_own on public.wishlist_items;
create policy wishlist_items_select_own on public.wishlist_items
  for select to authenticated
  using (user_id = auth.uid() and public.is_active_account());

drop policy if exists wishlist_items_insert_own on public.wishlist_items;
create policy wishlist_items_insert_own on public.wishlist_items
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_account());

drop policy if exists wishlist_items_delete_own on public.wishlist_items;
create policy wishlist_items_delete_own on public.wishlist_items
  for delete to authenticated
  using (user_id = auth.uid() and public.is_active_account());

-- ---------------------------------------------------------------------------
-- 4. Grants — least privilege
-- ---------------------------------------------------------------------------
-- `anon` must never reach this relation: a guest cannot create a wishlist row.
revoke all on table public.wishlist_items from anon;
revoke all on table public.wishlist_items from authenticated;
revoke all on table public.wishlist_items from public;

-- Exactly the three operations the feature performs. No UPDATE: ownership and
-- the product reference are immutable once written.
grant select, insert, delete on table public.wishlist_items to authenticated;

-- Maintenance path (server-side tooling / admin queries).
grant select, insert, delete on table public.wishlist_items to service_role;

-- ---------------------------------------------------------------------------
-- 5. Self-verification block
-- ---------------------------------------------------------------------------
do $$
declare
  v_table_exists boolean;
  v_rls boolean;
  v_unique_pair boolean;
  v_user_fk_cascade boolean;
  v_product_fk_cascade boolean;
  v_user_index boolean;
  v_product_index boolean;
  v_select_policy boolean;
  v_insert_policy boolean;
  v_delete_policy boolean;
  v_for_all_policy boolean;
  v_anon_policy boolean;
  v_anon_any boolean;
  v_auth_select boolean;
  v_auth_insert boolean;
  v_auth_delete boolean;
  v_auth_update boolean;
  v_service_select boolean;
  v_active_guard integer;
begin
  -- 1. Table exists
  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'wishlist_items' and c.relkind = 'r'
  ) into v_table_exists;

  if not v_table_exists then
    raise exception 'Migration 0014 failed: table public.wishlist_items does not exist';
  end if;

  -- 2. RLS enabled
  select relrowsecurity into v_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'wishlist_items';

  if not v_rls then
    raise exception 'Migration 0014 failed: row level security is not enabled on public.wishlist_items';
  end if;

  -- 3. Unique (user_id, product_id) — the idempotency contract
  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'wishlist_items'
      and con.contype = 'u'
      and (
        select array_agg(a.attname order by a.attname)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      ) = array['product_id', 'user_id']
  ) into v_unique_pair;

  if not v_unique_pair then
    raise exception 'Migration 0014 failed: public.wishlist_items lacks a unique (user_id, product_id) constraint';
  end if;

  -- 4. Foreign keys exist and cascade on delete
  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'wishlist_items'
      and con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
      and con.confdeltype = 'c'
  ) into v_user_fk_cascade;

  if not v_user_fk_cascade then
    raise exception 'Migration 0014 failed: wishlist_items.user_id must reference public.profiles(id) on delete cascade';
  end if;

  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'wishlist_items'
      and con.contype = 'f'
      and con.confrelid = 'public.products'::regclass
      and con.confdeltype = 'c'
  ) into v_product_fk_cascade;

  if not v_product_fk_cascade then
    raise exception 'Migration 0014 failed: wishlist_items.product_id must reference public.products(id) on delete cascade';
  end if;

  -- 5. Indexes
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'wishlist_items_user_created_idx'
  ) into v_user_index;

  if not v_user_index then
    raise exception 'Migration 0014 failed: index wishlist_items_user_created_idx is missing';
  end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'wishlist_items_product_idx'
  ) into v_product_index;

  if not v_product_index then
    raise exception 'Migration 0014 failed: index wishlist_items_product_idx is missing';
  end if;

  -- 6. Exactly the three per-command own-row policies, and no FOR ALL policy
  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wishlist_items'
      and policyname = 'wishlist_items_select_own' and cmd = 'SELECT'
  ) into v_select_policy;

  if not v_select_policy then
    raise exception 'Migration 0014 failed: policy wishlist_items_select_own is missing';
  end if;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wishlist_items'
      and policyname = 'wishlist_items_insert_own' and cmd = 'INSERT'
  ) into v_insert_policy;

  if not v_insert_policy then
    raise exception 'Migration 0014 failed: policy wishlist_items_insert_own is missing';
  end if;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wishlist_items'
      and policyname = 'wishlist_items_delete_own' and cmd = 'DELETE'
  ) into v_delete_policy;

  if not v_delete_policy then
    raise exception 'Migration 0014 failed: policy wishlist_items_delete_own is missing';
  end if;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wishlist_items' and cmd = 'ALL'
  ) into v_for_all_policy;

  if v_for_all_policy then
    raise exception 'Migration 0014 failed: a broad FOR ALL policy exists on public.wishlist_items';
  end if;

  -- 7. No policy is granted to anon
  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'wishlist_items'
      and 'anon' = any (roles)
  ) into v_anon_policy;

  if v_anon_policy then
    raise exception 'Migration 0014 failed: an anon-scoped policy exists on public.wishlist_items';
  end if;

  -- 8. Every policy carries the active-account guard
  select count(*) into v_active_guard
  from pg_policies
  where schemaname = 'public' and tablename = 'wishlist_items'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ilike '%is_active_account%';

  if v_active_guard <> 3 then
    raise exception 'Migration 0014 failed: expected 3 policies guarded by public.is_active_account(), found %', v_active_guard;
  end if;

  -- 9. anon holds no privilege of any kind
  select
    has_table_privilege('anon', 'public.wishlist_items', 'select')
    or has_table_privilege('anon', 'public.wishlist_items', 'insert')
    or has_table_privilege('anon', 'public.wishlist_items', 'update')
    or has_table_privilege('anon', 'public.wishlist_items', 'delete')
  into v_anon_any;

  if v_anon_any then
    raise exception 'Migration 0014 failed: anon unexpectedly holds privileges on public.wishlist_items';
  end if;

  -- 10. authenticated holds exactly SELECT / INSERT / DELETE — never UPDATE
  select has_table_privilege('authenticated', 'public.wishlist_items', 'select') into v_auth_select;
  select has_table_privilege('authenticated', 'public.wishlist_items', 'insert') into v_auth_insert;
  select has_table_privilege('authenticated', 'public.wishlist_items', 'delete') into v_auth_delete;
  select has_table_privilege('authenticated', 'public.wishlist_items', 'update') into v_auth_update;

  if not (v_auth_select and v_auth_insert and v_auth_delete) then
    raise exception 'Migration 0014 failed: authenticated is missing SELECT/INSERT/DELETE on public.wishlist_items';
  end if;

  if v_auth_update then
    raise exception 'Migration 0014 failed: authenticated must not hold UPDATE on public.wishlist_items (ownership fields are immutable)';
  end if;

  -- 11. service_role retains the maintenance path
  select has_table_privilege('service_role', 'public.wishlist_items', 'select') into v_service_select;

  if not v_service_select then
    raise exception 'Migration 0014 failed: service_role lacks SELECT on public.wishlist_items';
  end if;

  raise notice '--- Solenne 0014 OK: wishlist_items created, RLS enabled, own-row policies with active-account guard, no anon access, no UPDATE grant ---';
end $$;
