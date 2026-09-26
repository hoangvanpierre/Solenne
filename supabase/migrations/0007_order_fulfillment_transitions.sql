-- ===================================================
-- Solenne RBAC — 0007: atomic order fulfillment status transitions,
-- tracking code, outbox events, and direct UPDATE security hardening
-- ===================================================
-- Apply after 0001–0006. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Direct PostgREST UPDATE on public.orders by authenticated callers was
--      previously permitted under orders_update_with_order_update. Because
--      PostgreSQL RLS does not restrict column-level modifications, any user
--      with order.update could directly mutate financial columns (total, subtotal,
--      user_id, etc.). This migration revokes direct UPDATE on public.orders from
--      authenticated and anon, routing all fulfillment transitions through the
--      trusted, audited SECURITY DEFINER RPC public.update_order_status.
--   2. Orders require carrier tracking tracking_code for dispatched parcels.
--      tracking_code is mandatory (3-100 chars) for processing -> shipped, and
--      is cleared on operational rollback (shipped -> processing).
--   3. Operational rollback (shipped -> processing) is strictly restricted to
--      Manager and Admin roles (order.cancel permission) and requires an explicit
--      audit reason.
--   4. Generic fulfillment status updates MUST NOT allow transition to 'paid'.
--      Payment confirmation is reserved for dedicated Stripe webhooks / payment actions.
--   5. State machine transitions must be atomic relative to status updates,
--      tracking code modifications, in-transaction audit logging, and outbox event
--      enqueueing (public.order_outbox_events).
--   6. Status verification and transition execution use SELECT ... FOR UPDATE to
--      guarantee concurrency safety against races.
-- ===================================================

-- 1. Add tracking_code to public.orders if not exists
alter table public.orders
  add column if not exists tracking_code text;

comment on column public.orders.tracking_code is
  'Carrier shipment tracking number or dispatch reference. Mandatory when status is shipped. Cleared on rollback.';

-- 2. Create durable outbox table for order notification events
create table if not exists public.order_outbox_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  retry_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on table public.order_outbox_events is
  'Transactional outbox for order notification events committed atomically with order transitions.';

create index if not exists idx_order_outbox_events_status
  on public.order_outbox_events(status, created_at)
  where status = 'pending';

create index if not exists idx_order_outbox_events_order_id
  on public.order_outbox_events(order_id);

-- Enable RLS on outbox table
alter table public.order_outbox_events enable row level security;

-- Outbox privileges: no client direct inserts/updates
revoke all on public.order_outbox_events from public, anon, authenticated;
grant select, insert, update on public.order_outbox_events to service_role;

-- Allow authenticated users with order.read to view outbox events for admin inspection
drop policy if exists order_outbox_events_select_with_order_read on public.order_outbox_events;
create policy order_outbox_events_select_with_order_read on public.order_outbox_events
  for select to authenticated
  using (public.has_permission('order.read'));

grant select on public.order_outbox_events to authenticated;

-- 3. Hardening: Revoke direct UPDATE on public.orders from authenticated and anon
-- All order modifications must flow through SECURITY DEFINER RPCs (cancel_order, update_order_status)
revoke update on public.orders from authenticated, anon;
drop policy if exists orders_update_with_order_update on public.orders;

-- 4. Create atomic SECURITY DEFINER RPC: public.update_order_status
create or replace function public.update_order_status(
  p_order_id uuid,
  p_target_status text,
  p_tracking_code text default null,
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
  v_trimmed_tracking text;
  v_trimmed_reason text;
  v_tracking_after text;
  v_outbox_id uuid;
begin
  -- 1. Derive and verify authenticated caller from session
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Lock target order row FOR UPDATE to guarantee concurrency safety
  select id, order_number, status, tracking_code, user_id, shipping_address
  into v_order
  from public.orders
  where id = p_order_id
  for update;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 3. Idempotency: Reject if already in target status
  if v_order.status = p_target_status then
    raise exception 'ORDER_ALREADY_IN_STATUS' using errcode = '22000';
  end if;

  -- 4. Payment safety: 'paid' status cannot be transitioned to via generic fulfillment API
  if p_target_status = 'paid' then
    raise exception 'PAYMENT_STATUS_TRANSITION_DISALLOWED' using errcode = '42501';
  end if;

  -- 5. Cancellation safety: 'cancelled' status must use dedicated cancel_order RPC
  if p_target_status = 'cancelled' then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22000';
  end if;

  -- 6. Terminal states cannot be transitioned from
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22000';
  end if;

  v_trimmed_tracking := nullif(trim(p_tracking_code), '');
  v_trimmed_reason := nullif(trim(p_reason), '');

  -- 7. Evaluate State Machine and Role Authorization
  if v_order.status = 'shipped' and p_target_status = 'processing' then
    -- Operational Rollback: Strictly Manager/Admin (order.cancel permission)
    if not public.has_permission('order.cancel') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if v_trimmed_reason is null or length(v_trimmed_reason) < 3 then
      raise exception 'ROLLBACK_REASON_REQUIRED' using errcode = '22000';
    end if;

    if length(v_trimmed_reason) > 500 then
      raise exception 'ROLLBACK_REASON_INVALID' using errcode = '22000';
    end if;

    -- Update order: clear tracking_code to NULL
    update public.orders
    set status = 'processing',
        tracking_code = null,
        updated_at = now()
    where id = p_order_id;

    -- In-transaction audit log
    insert into public.audit_logs (
      actor_id,
      action,
      resource_type,
      resource_id,
      metadata
    ) values (
      v_actor_id,
      'order.fulfillment_rollback',
      'order',
      p_order_id::text,
      jsonb_build_object(
        'order_number', v_order.order_number,
        'previous_status', 'shipped',
        'new_status', 'processing',
        'reason', v_trimmed_reason,
        'tracking_code_before', v_order.tracking_code,
        'tracking_code_after', null
      )
    );

    -- In-transaction outbox event
    insert into public.order_outbox_events (
      order_id,
      event_type,
      payload,
      status
    ) values (
      p_order_id,
      'order.fulfillment_rollback',
      jsonb_build_object(
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'previous_status', 'shipped',
        'new_status', 'processing',
        'reason', v_trimmed_reason,
        'tracking_code_before', v_order.tracking_code,
        'tracking_code_after', null,
        'actor_id', v_actor_id
      ),
      'pending'
    ) returning id into v_outbox_id;

    return jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'previous_status', 'shipped',
      'new_status', 'processing',
      'tracking_code', null,
      'outbox_event_id', v_outbox_id
    );

  else
    -- Normal Forward Transitions: require order.update permission
    if not public.has_permission('order.update') then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;

    if v_order.status in ('pending', 'paid') and p_target_status = 'processing' then
      v_tracking_after := v_order.tracking_code;

      update public.orders
      set status = 'processing',
          updated_at = now()
      where id = p_order_id;

    elsif v_order.status = 'processing' and p_target_status = 'shipped' then
      if v_trimmed_tracking is null then
        raise exception 'TRACKING_CODE_REQUIRED' using errcode = '22000';
      end if;

      if length(v_trimmed_tracking) < 3 or length(v_trimmed_tracking) > 100 then
        raise exception 'TRACKING_CODE_INVALID' using errcode = '22000';
      end if;

      v_tracking_after := v_trimmed_tracking;

      update public.orders
      set status = 'shipped',
          tracking_code = v_trimmed_tracking,
          updated_at = now()
      where id = p_order_id;

    elsif v_order.status = 'shipped' and p_target_status = 'delivered' then
      v_tracking_after := v_order.tracking_code;

      update public.orders
      set status = 'delivered',
          updated_at = now()
      where id = p_order_id;

    else
      raise exception 'INVALID_STATUS_TRANSITION' using errcode = '22000';
    end if;

    -- In-transaction audit log
    insert into public.audit_logs (
      actor_id,
      action,
      resource_type,
      resource_id,
      metadata
    ) values (
      v_actor_id,
      'order.status_transition',
      'order',
      p_order_id::text,
      jsonb_build_object(
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'new_status', p_target_status,
        'reason', v_trimmed_reason,
        'tracking_code_before', v_order.tracking_code,
        'tracking_code_after', v_tracking_after
      )
    );

    -- In-transaction outbox event
    insert into public.order_outbox_events (
      order_id,
      event_type,
      payload,
      status
    ) values (
      p_order_id,
      'order.status_transition',
      jsonb_build_object(
        'order_id', p_order_id,
        'order_number', v_order.order_number,
        'previous_status', v_order.status,
        'new_status', p_target_status,
        'reason', v_trimmed_reason,
        'tracking_code_before', v_order.tracking_code,
        'tracking_code_after', v_tracking_after,
        'actor_id', v_actor_id
      ),
      'pending'
    ) returning id into v_outbox_id;

    return jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'previous_status', v_order.status,
      'new_status', p_target_status,
      'tracking_code', v_tracking_after,
      'outbox_event_id', v_outbox_id
    );
  end if;
end;
$$;

-- Revoke execute from public and anon
revoke all on function public.update_order_status(uuid, text, text, text) from public;
revoke all on function public.update_order_status(uuid, text, text, text) from anon;

-- Grant execution to authenticated and service_role
grant execute on function public.update_order_status(uuid, text, text, text) to authenticated;
grant execute on function public.update_order_status(uuid, text, text, text) to service_role;

-- Self-verification block
do $$
declare
  is_secdef boolean;
  has_col boolean;
  has_tbl boolean;
begin
  select prosecdef into is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'update_order_status';

  if is_secdef is null then
    raise exception 'Migration 0007 failed: function public.update_order_status does not exist';
  end if;

  if not is_secdef then
    raise exception 'Migration 0007 failed: function public.update_order_status is not SECURITY DEFINER';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'tracking_code'
  ) into has_col;

  if not has_col then
    raise exception 'Migration 0007 failed: column tracking_code does not exist on public.orders';
  end if;

  select exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'order_outbox_events'
  ) into has_tbl;

  if not has_tbl then
    raise exception 'Migration 0007 failed: table public.order_outbox_events does not exist';
  end if;

  raise notice '--- RBAC 0007 OK: public.update_order_status and outbox live and hardened ---';
end $$;
