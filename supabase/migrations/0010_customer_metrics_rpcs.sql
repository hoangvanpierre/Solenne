-- ===================================================
-- Solenne RBAC — 0010: Customer Directory Role Resolution & Purchase Metrics RPCs
-- ===================================================
-- Apply after 0001–0009. Idempotent and transaction-safe.
--
-- Why these functions exist:
--   1. Customer role isolation (F-02):
--      Staff members possess `customer.read` but lack `staff.read` / `role.read`.
--      Under RLS on `public.roles` (0003), staff cannot read `roles` directly,
--      and `public.role_id_by_name()` is SECURITY INVOKER.
--      `public.customer_role_id()` is a minimal SECURITY DEFINER helper returning
--      only the customer role UUID with fixed search_path.
--
--   2. Bounded, high-performance purchase aggregation (F-01):
--      Aggregating orders row-by-row in application memory is unbounded, risks
--      silent PostgREST max_rows truncation, and causes high memory/latency.
--      `public.get_customer_purchase_metrics()` computes SQL aggregates directly
--      in the database engine in a single pass.
--
--   3. Strict authorization and defense in depth (F-01, F-02, F-06):
--      - Enforces authentication (`auth.uid() is not null`).
--      - Enforces both `customer.read` AND `order.read` inside the RPC boundary.
--      - Validates input array (non-null, 1-dimensional, max 100 items, no nulls).
--      - Restricts metrics strictly to customer-role profiles: IDs belonging to
--        staff, managers, or admins are never returned.
--      - Preserves exact commerce semantics:
--        * order_count: status <> 'cancelled' (includes pending/unpaid).
--        * lifetime_spend: sum of orders.total in USD for 'paid', 'processing',
--          'shipped', and 'delivered' (excludes cancelled and pending).
-- ===================================================

-- ---------------------------------------------------------------------------
-- 1. Customer-role resolver (minimal, scoped role ID lookup)
-- ---------------------------------------------------------------------------
create or replace function public.customer_role_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.roles where name = 'customer' limit 1;
$$;

comment on function public.customer_role_id() is
  'Returns the UUID of the customer role. Scoped SECURITY DEFINER lookup allowing authorized staff to filter customers.';

revoke all on function public.customer_role_id() from public;
revoke all on function public.customer_role_id() from anon;
grant execute on function public.customer_role_id() to authenticated;
grant execute on function public.customer_role_id() to service_role;


-- ---------------------------------------------------------------------------
-- 2. Customer purchase metrics RPC (database-side aggregation)
-- ---------------------------------------------------------------------------
create or replace function public.get_customer_purchase_metrics(
  p_user_ids uuid[]
)
returns table (
  user_id uuid,
  order_count bigint,
  lifetime_spend numeric
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- 1. Enforce authenticated caller
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Enforce both customer.read and order.read inside the database boundary
  if not (public.has_permission('customer.read') and public.has_permission('order.read')) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 3. Validate input array bounds and structure
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'INVALID_ARGUMENT: p_user_ids cannot be null or empty' using errcode = '22000';
  end if;

  if array_ndims(p_user_ids) <> 1 then
    raise exception 'INVALID_ARGUMENT: p_user_ids must be a one-dimensional array' using errcode = '22000';
  end if;

  if array_length(p_user_ids, 1) > 100 then
    raise exception 'INVALID_ARGUMENT: p_user_ids cannot exceed 100 items' using errcode = '22000';
  end if;

  if exists (select 1 from unnest(p_user_ids) as elem where elem is null) then
    raise exception 'INVALID_ARGUMENT: p_user_ids cannot contain null elements' using errcode = '22004';
  end if;

  -- 4. Bounded aggregation restricted strictly to customer-role profiles
  return query
  with customer_profiles as (
    select p.id as customer_id
    from public.profiles p
    where p.id = any(p_user_ids)
      and p.role_id = public.customer_role_id()
  )
  select
    cp.customer_id as user_id,
    count(o.id) filter (where o.status <> 'cancelled')::bigint as order_count,
    coalesce(
      sum(o.total) filter (where o.status in ('paid', 'processing', 'shipped', 'delivered')),
      0
    )::numeric as lifetime_spend
  from customer_profiles cp
  left join public.orders o on o.user_id = cp.customer_id
  group by cp.customer_id;
end;
$$;

comment on function public.get_customer_purchase_metrics(uuid[]) is
  'Aggregates orderCount (non-cancelled) and lifetimeSpend (fulfilled/paid USD) for up to 100 customer UUIDs. Enforces customer.read and order.read.';

revoke all on function public.get_customer_purchase_metrics(uuid[]) from public;
revoke all on function public.get_customer_purchase_metrics(uuid[]) from anon;
grant execute on function public.get_customer_purchase_metrics(uuid[]) to authenticated;
grant execute on function public.get_customer_purchase_metrics(uuid[]) to service_role;


-- ---------------------------------------------------------------------------
-- 3. Self-verification block
-- ---------------------------------------------------------------------------
do $$
declare
  v_role_id uuid;
  is_secdef boolean;
begin
  -- Verify customer_role_id existence and security definer setting
  select prosecdef into is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'customer_role_id';

  if is_secdef is null then
    raise exception 'Migration 0010 failed: function public.customer_role_id does not exist';
  end if;

  if not is_secdef then
    raise exception 'Migration 0010 failed: function public.customer_role_id is not SECURITY DEFINER';
  end if;

  -- Verify get_customer_purchase_metrics existence
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_customer_purchase_metrics'
  ) then
    raise exception 'Migration 0010 failed: function public.get_customer_purchase_metrics does not exist';
  end if;

  raise notice '--- RBAC 0010 OK: customer_role_id and get_customer_purchase_metrics created ---';
end $$;
