-- ===================================================
-- Solenne RBAC — 0009: atomic inventory adjustment & audit logging
-- ===================================================
-- Apply after 0001–0008. Idempotent and transaction-safe.
--
-- Why this function exists:
--   1. Inventory adjustments (receiving stock, cycle count corrections, shrinkage)
--      must be ATOMIC and serialized: concurrent updates must not overwrite each other.
--   2. PostgREST does not support relative arithmetic in REST PATCH payloads, and
--      authenticated callers have no direct UPDATE grant on product_variants (revoked in 0005).
--   3. Actor identity is derived strictly from auth.uid() — never client input.
--   4. Gated internally by public.has_permission('inventory.update'), which is held
--      by staff, manager, and admin roles (0002).
--   5. In-transaction audit logging: every adjustment produces exactly one
--      inventory.adjusted audit row atomically with the stock mutation.
--   6. CRITICAL SCHEMA NOTE: public.product_variants has NO updated_at column.
--      This function only updates stock_quantity.
-- ===================================================

create or replace function public.adjust_inventory_stock(
  p_variant_id uuid,
  p_delta integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid;
  v_reason text;
  v_variant record;
  v_product_name text;
  v_previous_stock integer;
  v_new_stock integer;
begin
  -- 1. Derive and verify authenticated caller from the request context
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Verify inventory.update permission inside the trusted boundary
  if not public.has_permission('inventory.update') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 3. Validate delta input
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID_DELTA' using errcode = '22000';
  end if;

  -- 4. Validate and sanitize reason input
  v_reason := trim(coalesce(p_reason, ''));
  if length(v_reason) < 3 then
    raise exception 'REASON_REQUIRED' using errcode = '22000';
  end if;
  if length(v_reason) > 255 then
    raise exception 'REASON_INVALID' using errcode = '22000';
  end if;

  -- 5. Lock target variant row FOR UPDATE to guarantee concurrency serialization
  select id, product_id, name, sku, stock_quantity
  into v_variant
  from public.product_variants
  where id = p_variant_id
  for update;

  if v_variant.id is null then
    raise exception 'VARIANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 6. Compute new stock and enforce non-negative invariant
  v_previous_stock := v_variant.stock_quantity;
  v_new_stock := v_previous_stock + p_delta;

  if v_new_stock < 0 then
    raise exception 'INSUFFICIENT_STOCK' using errcode = '22000';
  end if;

  -- 7. Execute relative stock update (product_variants has no updated_at column)
  update public.product_variants
  set stock_quantity = v_new_stock
  where id = p_variant_id;

  -- 8. Fetch product name for rich audit trail
  select name into v_product_name
  from public.products
  where id = v_variant.product_id;

  -- 9. Insert atomic audit log within the same transaction
  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_actor_id,
    'inventory.adjusted',
    'product_variant',
    p_variant_id::text,
    jsonb_build_object(
      'sku', v_variant.sku,
      'product_id', v_variant.product_id,
      'product_name', coalesce(v_product_name, 'Unknown'),
      'variant_name', v_variant.name,
      'previous_stock', v_previous_stock,
      'new_stock', v_new_stock,
      'delta', p_delta,
      'reason', v_reason
    )
  );

  -- 10. Return operational summary
  return jsonb_build_object(
    'success', true,
    'variant_id', v_variant.id,
    'sku', v_variant.sku,
    'previous_stock', v_previous_stock,
    'new_stock', v_new_stock,
    'delta', p_delta
  );
end;
$$;

-- Revoke execute from public and anon
revoke all on function public.adjust_inventory_stock(uuid, integer, text) from public;
revoke all on function public.adjust_inventory_stock(uuid, integer, text) from anon;

-- Grant execute to authenticated and service_role
grant execute on function public.adjust_inventory_stock(uuid, integer, text) to authenticated;
grant execute on function public.adjust_inventory_stock(uuid, integer, text) to service_role;

-- Self-verification block
do $$
declare
  is_secdef boolean;
begin
  select prosecdef into is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'adjust_inventory_stock';

  if is_secdef is null then
    raise exception 'Migration 0009 failed: function public.adjust_inventory_stock does not exist';
  end if;

  if not is_secdef then
    raise exception 'Migration 0009 failed: function public.adjust_inventory_stock is not SECURITY DEFINER';
  end if;

  raise notice '--- RBAC 0009 OK: public.adjust_inventory_stock created and hardened ---';
end $$;
