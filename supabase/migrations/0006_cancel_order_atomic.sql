-- ===================================================
-- Solenne RBAC — 0006: atomic order cancellation & stock restoration
-- ===================================================
-- Apply after 0001–0005. Idempotent and transaction-safe.
--
-- Why this function exists:
--   1. Inventory restoration must be ATOMIC relative to the order status
--      transition: if inventory cannot be restored, the cancellation must roll
--      back; if status cannot be updated, stock must not be incremented.
--   2. PostgREST does not support relative arithmetic in REST PATCH payloads
--      (e.g. stock_quantity = stock_quantity + delta), and authenticated callers
--      have no direct UPDATE grant on product_variants (revoked in 0005).
--   3. Double-cancellation (retries) must be idempotent: once cancelled, subsequent
--      calls must see the cancelled status and not restore stock a second time.
--   4. Actor identity is derived strictly from auth.uid() — never client input.
--   5. Gated internally by public.has_permission('order.cancel'), which is held
--      only by manager and admin roles (0002).
-- ===================================================

create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid;
  v_order record;
  v_item record;
  v_variant_exists boolean;
  v_restored_count int := 0;
  v_reason text;
begin
  -- 1. Derive and verify authenticated caller from the request context
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Verify order.cancel permission inside the trusted boundary
  if not public.has_permission('order.cancel') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 3. Lock the target order row for update to guarantee concurrency safety
  select id, order_number, status
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 4. Idempotency & status validation
  if v_order.status = 'cancelled' then
    raise exception 'ORDER_ALREADY_CANCELLED' using errcode = '22000';
  end if;

  if v_order.status not in ('pending', 'paid', 'processing') then
    raise exception 'ORDER_STATUS_NOT_CANCELLABLE' using errcode = '22000';
  end if;

  -- 5. Inventory restoration: verify all items have resolvable variants first
  -- If any variant is missing, fail the entire transaction (all-or-nothing)
  for v_item in
    select id, variant_id, quantity
    from public.order_items
    where order_id = p_order_id
  loop
    if v_item.variant_id is null then
      raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0002';
    end if;

    select exists (
      select 1 from public.product_variants where id = v_item.variant_id
    ) into v_variant_exists;

    if not v_variant_exists then
      raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0002';
    end if;

    -- Relative atomic increment
    update public.product_variants
    set stock_quantity = stock_quantity + v_item.quantity
    where id = v_item.variant_id;

    v_restored_count := v_restored_count + 1;
  end loop;

  -- 6. Transition order status to 'cancelled'
  update public.orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id;

  -- 7. Record audit row within the same transaction
  v_reason := coalesce(nullif(trim(p_reason), ''), 'Order cancelled by management');

  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_actor_id,
    'order.cancelled',
    'order',
    p_order_id::text,
    jsonb_build_object(
      'order_number', v_order.order_number,
      'previous_status', v_order.status,
      'reason', v_reason,
      'items_restored', v_restored_count
    )
  );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'previous_status', v_order.status,
    'items_restored', v_restored_count
  );
end;
$$;

-- Revoke execute from public and anon
revoke all on function public.cancel_order(uuid, text) from public;
revoke all on function public.cancel_order(uuid, text) from anon;

-- Grant execution to authenticated and service_role
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to service_role;

-- Self-verification block
do $$
declare
  is_secdef boolean;
begin
  select prosecdef into is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cancel_order';

  if is_secdef is null then
    raise exception 'Migration 0006 failed: function public.cancel_order does not exist';
  end if;

  if not is_secdef then
    raise exception 'Migration 0006 failed: function public.cancel_order is not SECURITY DEFINER';
  end if;

  raise notice '--- RBAC 0006 OK: public.cancel_order created and hardened ---';
end $$;
