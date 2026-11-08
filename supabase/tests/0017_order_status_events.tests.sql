-- ===================================================
-- Solenne — Phase 2 integration tests: order status history
-- ===================================================
-- Run on a FRESH disposable database after:
--   0016_create_order.fixture.sql
--   migrations 0001, 0002, 0003, 0005, 0006, 0007, 0008, 0016
--   0016_create_order.seed.sql
--   0017_order_status_events.legacy.sql
--   migration 0017
--   0016_create_order.tests.sql  (creates test_checkout/test_cancel helpers)
--
-- Every failure raises and aborts the run. See supabase/tests/README.md.
-- ===================================================

create or replace function public.test_transition(
  p_uid uuid,
  p_order_id uuid,
  p_target_status text,
  p_tracking_code text default null,
  p_reason text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';

  begin
    v_result := public.update_order_status(
      p_order_id, p_target_status, p_tracking_code, p_reason
    );
  exception when others then
    v_result := jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate);
  end;

  execute 'reset role';
  return v_result;
end $$;

create or replace function public.test_visible_event_count(
  p_uid uuid,
  p_order_id uuid
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
  select count(*) into v_count
  from public.order_status_events
  where order_id = p_order_id;
  execute 'reset role';
  return v_count;
end $$;

create or replace function public.test_admin_order_events(
  p_uid uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';

  begin
    select coalesce(
      jsonb_agg(to_jsonb(e) order by e.created_at asc, e.id asc),
      '[]'::jsonb
    )
    into v_result
    from public.get_order_status_events_admin(p_order_id) e;
  exception when others then
    v_result := jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate);
  end;

  execute 'reset role';
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Initial creation records exactly one 'creation' event
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_order record;
  v_event record;
  v_count integer;
begin
  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-phase2-initial-0001'
  );

  if v ? 'error' then
    raise exception '1a: create failed: %', v ->> 'error';
  end if;

  select * into v_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-initial-0001';

  select count(*) into v_count
  from public.order_status_events
  where order_id = v_order.id;

  if v_count <> 1 then
    raise exception '1b: expected 1 event, found %', v_count;
  end if;

  select * into v_event
  from public.order_status_events
  where order_id = v_order.id;

  if v_event.source <> 'creation'
     or v_event.from_status is not null
     or v_event.to_status <> 'pending'
     or v_event.actor_user_id <> 'a1111111-1111-4111-8111-111111111111'
     or v_event.reason is not null
     or v_event.tracking_code is not null then
    raise exception '1c: initial event is wrong: %', row_to_json(v_event);
  end if;

  raise notice '1. initial creation event: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Every successful transition adds exactly one event
-- ---------------------------------------------------------------------------
do $$
declare
  v_order record;
  v_result jsonb;
  v_event record;
  v_count integer;
begin
  select * into v_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-initial-0001';

  -- pending -> processing
  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'processing',
    null,
    'Packed for dispatch'
  );
  if v_result ? 'error' then
    raise exception '2a: pending->processing failed: %', v_result ->> 'error';
  end if;

  select count(*) into v_count from public.order_status_events where order_id = v_order.id;
  if v_count <> 2 then
    raise exception '2b: expected 2 events after one transition, found %', v_count;
  end if;

  select * into v_event
  from public.order_status_events
  where order_id = v_order.id
    and from_status = 'pending'
    and to_status = 'processing';
  if v_event.id is null
     or v_event.source <> 'transition'
     or v_event.actor_user_id <> 'd4444444-4444-4444-8444-444444444444'
     or v_event.reason <> 'Packed for dispatch'
     or v_event.tracking_code is not null then
    raise exception '2c: processing event is wrong: %', row_to_json(v_event);
  end if;

  -- processing -> shipped
  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'shipped',
    'TRACK-PHASE2-001',
    null
  );
  if v_result ? 'error' then
    raise exception '2d: processing->shipped failed: %', v_result ->> 'error';
  end if;

  select count(*) into v_count from public.order_status_events where order_id = v_order.id;
  if v_count <> 3 then
    raise exception '2e: expected 3 events after two transitions, found %', v_count;
  end if;

  select * into v_event
  from public.order_status_events
  where order_id = v_order.id
    and from_status = 'processing'
    and to_status = 'shipped';
  if v_event.id is null
     or v_event.tracking_code <> 'TRACK-PHASE2-001'
     or v_event.actor_user_id <> 'd4444444-4444-4444-8444-444444444444' then
    raise exception '2f: shipped event is wrong: %', row_to_json(v_event);
  end if;

  -- shipped -> delivered
  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'delivered',
    null,
    'Delivered by courier'
  );
  if v_result ? 'error' then
    raise exception '2g: shipped->delivered failed: %', v_result ->> 'error';
  end if;

  select count(*) into v_count from public.order_status_events where order_id = v_order.id;
  if v_count <> 4 then
    raise exception '2h: expected 4 events after three transitions, found %', v_count;
  end if;

  select * into v_event
  from public.order_status_events
  where order_id = v_order.id
    and from_status = 'shipped'
    and to_status = 'delivered';
  if v_event.id is null
     or v_event.tracking_code <> 'TRACK-PHASE2-001'
     or v_event.reason <> 'Delivered by courier' then
    raise exception '2i: delivered event is wrong: %', row_to_json(v_event);
  end if;

  raise notice '2. one event per successful transition: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cancellation records an event and restores stock
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_order record;
  v_cancel jsonb;
  v_event record;
  v_status text;
  v_stock_before integer;
  v_stock_after_create integer;
  v_stock_after_cancel integer;
begin
  select stock_quantity into v_stock_before
  from public.product_variants
  where id = '20000000-0000-4000-8000-000000000004';

  v := public.test_checkout(
    'b2222222-2222-4222-8222-222222222222',
    'customer.b@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000004', 2),
    'it-phase2-cancel-0001'
  );
  if v ? 'error' then
    raise exception '3a: create failed: %', v ->> 'error';
  end if;

  select * into v_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-cancel-0001';

  select stock_quantity into v_stock_after_create
  from public.product_variants
  where id = '20000000-0000-4000-8000-000000000004';

  if v_stock_after_create <> v_stock_before - 2 then
    raise exception '3b: stock was not deducted before cancellation';
  end if;

  v_cancel := public.test_cancel(
    'e5555555-5555-4555-8555-555555555555',
    v_order.id,
    'phase2 cancellation'
  );
  if v_cancel ? 'error' then
    raise exception '3c: cancel failed: %', v_cancel ->> 'error';
  end if;

  select status into v_status from public.orders where id = v_order.id;
  if v_status <> 'cancelled' then
    raise exception '3d: order was not cancelled';
  end if;

  select stock_quantity into v_stock_after_cancel
  from public.product_variants
  where id = '20000000-0000-4000-8000-000000000004';

  if v_stock_after_cancel <> v_stock_before then
    raise exception '3e: stock was not restored (% -> %)', v_stock_after_create, v_stock_after_cancel;
  end if;

  select * into v_event
  from public.order_status_events
  where order_id = v_order.id
    and source = 'cancellation';

  if v_event.id is null
     or v_event.from_status <> 'pending'
     or v_event.to_status <> 'cancelled'
     or v_event.actor_user_id <> 'e5555555-5555-4555-8555-555555555555'
     or v_event.reason <> 'phase2 cancellation' then
    raise exception '3f: cancellation event is wrong: %', row_to_json(v_event);
  end if;

  raise notice '3. cancellation event + stock restoration: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Failed and unauthorized transitions create no event
-- ---------------------------------------------------------------------------
do $$
declare
  v_order record;
  v_result jsonb;
  v_count integer;
begin
  -- Delivered order from test 2: terminal states cannot transition.
  select * into v_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-initial-0001';

  select count(*) into v_count
  from public.order_status_events
  where order_id = v_order.id;

  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'processing',
    null,
    'illegal rollback'
  );
  if not (v_result ->> 'error') like 'INVALID_STATUS_TRANSITION%' then
    raise exception '4a: expected INVALID_STATUS_TRANSITION, got %', v_result;
  end if;

  if (select count(*) from public.order_status_events where order_id = v_order.id) <> v_count then
    raise exception '4b: failed terminal transition created an event';
  end if;

  -- Fresh pending order for the remaining checks.
  v_result := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-phase2-failed-0001'
  );
  if v_result ? 'error' then
    raise exception '4c: create failed: %', v_result ->> 'error';
  end if;

  select * into v_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-failed-0001';

  select count(*) into v_count
  from public.order_status_events
  where order_id = v_order.id;
  if v_count <> 1 then
    raise exception '4d: expected 1 creation event, found %', v_count;
  end if;

  -- Customer lacks order.update.
  v_result := public.test_transition(
    'a1111111-1111-4111-8111-111111111111',
    v_order.id,
    'processing',
    null,
    null
  );
  if not (v_result ->> 'error') like 'FORBIDDEN%' then
    raise exception '4e: customer transition was not forbidden: %', v_result;
  end if;
  if (select count(*) from public.order_status_events where order_id = v_order.id) <> v_count then
    raise exception '4f: forbidden transition created an event';
  end if;

  -- pending -> shipped is not a legal edge.
  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'shipped',
    'TRACK-INVALID',
    null
  );
  if not (v_result ->> 'error') like 'INVALID_STATUS_TRANSITION%' then
    raise exception '4g: expected INVALID_STATUS_TRANSITION, got %', v_result;
  end if;
  if (select count(*) from public.order_status_events where order_id = v_order.id) <> v_count then
    raise exception '4h: illegal edge created an event';
  end if;

  -- 'paid' is not a fulfillment target.
  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'paid',
    null,
    null
  );
  if not (v_result ->> 'error') like 'PAYMENT_STATUS_TRANSITION_DISALLOWED%' then
    raise exception '4i: expected PAYMENT_STATUS_TRANSITION_DISALLOWED, got %', v_result;
  end if;
  if (select count(*) from public.order_status_events where order_id = v_order.id) <> v_count then
    raise exception '4j: paid target created an event';
  end if;

  -- One valid transition succeeds and adds exactly one event.
  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'processing',
    null,
    'valid processing'
  );
  if v_result ? 'error' then
    raise exception '4k: valid transition failed: %', v_result ->> 'error';
  end if;
  if (select count(*) from public.order_status_events where order_id = v_order.id) <> v_count + 1 then
    raise exception '4l: valid transition did not add exactly one event';
  end if;

  -- Missing tracking fails AFTER the order update branch would be entered, so
  -- it is the strongest check that no partial event is written.
  v_result := public.test_transition(
    'd4444444-4444-4444-8444-444444444444',
    v_order.id,
    'shipped',
    null,
    null
  );
  if not (v_result ->> 'error') like 'TRACKING_CODE_REQUIRED%' then
    raise exception '4m: expected TRACKING_CODE_REQUIRED, got %', v_result;
  end if;
  if (select count(*) from public.order_status_events where order_id = v_order.id) <> v_count + 1 then
    raise exception '4n: missing tracking code created an event';
  end if;

  raise notice '4. failed/unauthorized transitions create no event: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Customer A cannot read Customer B's events
-- ---------------------------------------------------------------------------
do $$
declare
  a_order uuid;
  b_order uuid;
begin
  select id into a_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-initial-0001';

  select id into b_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-cancel-0001';

  if public.test_visible_event_count('a1111111-1111-4111-8111-111111111111', a_order) < 1 then
    raise exception '5a: customer A cannot read their own events';
  end if;

  if public.test_visible_event_count('a1111111-1111-4111-8111-111111111111', b_order) <> 0 then
    raise exception '5b: customer A can read customer B events';
  end if;

  if public.test_visible_event_count('b2222222-2222-4222-8222-222222222222', b_order) < 1 then
    raise exception '5c: customer B cannot read their own events';
  end if;

  if public.test_visible_event_count('b2222222-2222-4222-8222-222222222222', a_order) <> 0 then
    raise exception '5d: customer B can read customer A events';
  end if;

  raise notice '5. customer event isolation: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Customers cannot directly insert, update or delete events
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);

do $$
declare
  a_order uuid;
  v_count integer;
  v_actor uuid;
  v_reason text;
  v_any record;
  v_result jsonb;
begin
  select id into a_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-initial-0001';

  begin
    insert into public.order_status_events (order_id, to_status)
    values (a_order, 'pending');
    raise exception '6a: direct INSERT was allowed';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;

  begin
    update public.order_status_events
    set reason = 'tampered'
    where order_id = a_order;
    raise exception '6b: direct UPDATE was allowed';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;

  begin
    delete from public.order_status_events
    where order_id = a_order;
    raise exception '6c: direct DELETE was allowed';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;

  -- The granted timeline columns remain readable to the owner.
  select count(*) into v_count
  from public.order_status_events
  where order_id = a_order;
  if v_count < 1 then
    raise exception '6d: customer cannot read the granted timeline columns';
  end if;

  -- Internal columns are not granted to authenticated.
  begin
    select actor_user_id into v_actor
    from public.order_status_events
    where order_id = a_order
    limit 1;
    raise exception '6e: customer read actor_user_id';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;

  begin
    select reason into v_reason
    from public.order_status_events
    where order_id = a_order
    limit 1;
    raise exception '6f: customer read reason';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;

  begin
    select * into v_any
    from public.order_status_events
    where order_id = a_order
    limit 1;
    raise exception '6g: customer SELECT * was allowed';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;

  -- The management RPC is order.read-gated and must refuse customers.
  v_result := public.test_admin_order_events(
    'a1111111-1111-4111-8111-111111111111',
    a_order
  );
  if not (v_result ->> 'error') like 'FORBIDDEN%' then
    raise exception '6h: customer could call the admin history RPC: %', v_result;
  end if;
end $$;

reset role;
rollback;

do $$
begin
  if has_table_privilege('authenticated', 'public.order_status_events', 'SELECT') then
    raise exception '6i: authenticated still has table-level SELECT';
  end if;

  if not has_column_privilege('authenticated', 'public.order_status_events', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.order_status_events', 'order_id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.order_status_events', 'from_status', 'SELECT')
     or not has_column_privilege('authenticated', 'public.order_status_events', 'to_status', 'SELECT')
     or not has_column_privilege('authenticated', 'public.order_status_events', 'tracking_code', 'SELECT')
     or not has_column_privilege('authenticated', 'public.order_status_events', 'source', 'SELECT')
     or not has_column_privilege('authenticated', 'public.order_status_events', 'created_at', 'SELECT') then
    raise exception '6j: authenticated is missing a granted timeline column';
  end if;

  if has_column_privilege('authenticated', 'public.order_status_events', 'actor_user_id', 'SELECT')
     or has_column_privilege('authenticated', 'public.order_status_events', 'reason', 'SELECT') then
    raise exception '6k: authenticated can read actor_user_id/reason';
  end if;

  if has_table_privilege('authenticated', 'public.order_status_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.order_status_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.order_status_events', 'DELETE') then
    raise exception '6l: authenticated still holds a write privilege';
  end if;

  if has_table_privilege('anon', 'public.order_status_events', 'SELECT') then
    raise exception '6m: anon can read order status events';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_order_status_events_admin(uuid)',
    'EXECUTE'
  ) then
    raise exception '6n: authenticated cannot execute the admin history RPC';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_order_status_events_admin(uuid)',
    'EXECUTE'
  ) then
    raise exception '6o: anon can execute the admin history RPC';
  end if;

  raise notice '6. direct modification + column privacy denied: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Staff/manager access follows order.read
-- ---------------------------------------------------------------------------
do $$
declare
  a_order uuid;
  b_order uuid;
  v_result jsonb;
begin
  select id into a_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-initial-0001';

  select id into b_order
  from public.orders
  where checkout_idempotency_key = 'it-phase2-cancel-0001';

  if public.test_visible_event_count('d4444444-4444-4444-8444-444444444444', a_order) < 1 then
    raise exception '7a: staff cannot read an order timeline';
  end if;

  if public.test_visible_event_count('e5555555-5555-4555-8555-555555555555', b_order) < 1 then
    raise exception '7b: manager cannot read an order timeline';
  end if;

  v_result := public.test_admin_order_events(
    'd4444444-4444-4444-8444-444444444444',
    a_order
  );
  if v_result ? 'error' then
    raise exception '7c: staff admin RPC failed: %', v_result ->> 'error';
  end if;
  if jsonb_array_length(v_result) < 1 then
    raise exception '7d: staff admin RPC returned no events';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_result) e
    where e ->> 'actor_user_id' is not null
  ) then
    raise exception '7e: staff admin RPC hid the actor';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_result) e
    where e ->> 'reason' = 'Packed for dispatch'
  ) then
    raise exception '7f: staff admin RPC hid the reason';
  end if;

  v_result := public.test_admin_order_events(
    'e5555555-5555-4555-8555-555555555555',
    b_order
  );
  if v_result ? 'error' then
    raise exception '7g: manager admin RPC failed: %', v_result ->> 'error';
  end if;

  raise notice '7. staff/manager timeline + admin RPC access: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Backfill records only the status known at migration time
-- ---------------------------------------------------------------------------
do $$
declare
  v_order record;
  v_event record;
  v_count integer;
begin
  select * into v_order
  from public.orders
  where order_number = 'LEGACY-001';

  select count(*) into v_count
  from public.order_status_events
  where order_id = v_order.id;

  if v_count <> 1 then
    raise exception '8a: expected exactly 1 backfill event, found %', v_count;
  end if;

  select * into v_event
  from public.order_status_events
  where order_id = v_order.id;

  if v_event.source <> 'backfill'
     or v_event.from_status is not null
     or v_event.to_status <> 'processing'
     or v_event.actor_user_id is not null
     or v_event.reason is not null
     or v_event.tracking_code <> 'TRACK-LEGACY-001' then
    raise exception '8b: backfill event is wrong: %', row_to_json(v_event);
  end if;

  if v_event.created_at <= v_order.updated_at then
    raise exception '8c: backfill timestamp reuses historical order time';
  end if;

  if exists (
    select 1
    from public.order_status_events
    where order_id = v_order.id
      and (to_status = 'pending' or from_status is not null)
  ) then
    raise exception '8d: backfill fabricated an earlier transition';
  end if;

  raise notice '8. backfill does not fabricate history: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 9. A failed creation rolls back its creation event with the order
-- ---------------------------------------------------------------------------
begin;

create or replace function public.test_fail_audit_phase2()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'order.created'
     and new.metadata ->> 'idempotencyKey' = 'it-phase2-audit-fail-0001' then
    raise exception 'TEST_AUDIT_FAILURE_PHASE2';
  end if;
  return new;
end $$;

create trigger test_fail_audit_phase2
  before insert on public.audit_logs
  for each row execute function public.test_fail_audit_phase2();

do $$
declare
  v jsonb;
  v_stock_before integer;
  v_stock_after integer;
begin
  select stock_quantity into v_stock_before
  from public.product_variants
  where id = '20000000-0000-4000-8000-000000000004';

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000004', 1),
    'it-phase2-audit-fail-0001'
  );

  if not (v ->> 'error') like 'TEST_AUDIT_FAILURE_PHASE2%' then
    raise exception '9a: expected injected audit failure, got %', v;
  end if;

  if exists (
    select 1 from public.orders
    where checkout_idempotency_key = 'it-phase2-audit-fail-0001'
  ) then
    raise exception '9b: failed order row was left behind';
  end if;

  if exists (
    select 1
    from public.order_status_events e
    join public.orders o on o.id = e.order_id
    where o.checkout_idempotency_key = 'it-phase2-audit-fail-0001'
  ) then
    raise exception '9c: failed order left a status event behind';
  end if;

  select stock_quantity into v_stock_after
  from public.product_variants
  where id = '20000000-0000-4000-8000-000000000004';

  if v_stock_after <> v_stock_before then
    raise exception '9d: failed order changed stock';
  end if;

  raise notice '9. failed creation rolls back its event: PASS';
end $$;

drop trigger test_fail_audit_phase2 on public.audit_logs;
drop function public.test_fail_audit_phase2();

rollback;

do $$
begin
  raise notice '--- Solenne 0017 integration suite: ALL CHECKS PASSED ---';
end $$;
