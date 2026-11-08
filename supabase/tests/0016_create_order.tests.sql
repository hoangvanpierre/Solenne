-- ===================================================
-- Solenne — integration tests for migration 0016 (create_order)
-- ===================================================
-- Run on a FRESH disposable database after:
--   0016_create_order.fixture.sql
--   migrations 0001, 0002, 0003, 0005, 0006, 0007, 0008, 0016
--   0016_create_order.seed.sql
--
-- The suite is deliberately self-contained SQL (no psql meta-commands, no
-- extensions) so it can run through psql or a disposable Postgres-in-WASM
-- harness. Every failure raises and aborts the run.
--
-- It NEVER touches a database with existing orders: the fixture refuses to
-- seed one. See supabase/tests/README.md.
-- ===================================================

-- ---------------------------------------------------------------------------
-- Test helpers. These live only in the disposable test database.
-- ---------------------------------------------------------------------------

-- Impersonates a customer and calls the RPC with the same client shape the
-- application uses. Database errors are returned as {error, sqlstate} so the
-- caller can assert on the stable `CODE||detail` contract.
create or replace function public.test_checkout(
  p_uid uuid,
  p_email text,
  p_address jsonb,
  p_items jsonb,
  p_key text,
  p_notes text default null
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
    v_result := public.create_order(
      p_email, p_address, p_items, p_key, p_notes
    );
  exception when others then
    v_result := jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate);
  end;

  execute 'reset role';
  return v_result;
end $$;

create or replace function public.test_cancel(
  p_uid uuid,
  p_order_id uuid,
  p_reason text
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
    v_result := public.cancel_order(p_order_id, p_reason);
  exception when others then
    v_result := jsonb_build_object('error', sqlerrm, 'sqlstate', sqlstate);
  end;

  execute 'reset role';
  return v_result;
end $$;

create or replace function public.test_address()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'fullName', 'Customer A',
    'phone', '0901234567',
    'line1', '123 Le Loi',
    'city', 'Ho Chi Minh City',
    'state', 'Ho Chi Minh',
    'postalCode', '700000',
    'country', 'Vietnam',
    'countryCode', 'VN'
  );
$$;

create or replace function public.test_items(
  p_variant_id text,
  p_quantity integer
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_array(
    jsonb_build_object('variantId', p_variant_id, 'quantity', p_quantity)
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Successful order creation: pricing, ownership, items, stock, audit
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_order record;
  v_item record;
  v_audit record;
begin
  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    '  Customer.A@Example.Test ',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 2),
    'it-success-0001',
    '  Leave at door  '
  );

  if v ? 'error' then
    raise exception '1: unexpected error: %', v ->> 'error';
  end if;
  if (v ->> 'success')::boolean is not true then
    raise exception '1: success flag missing';
  end if;
  if v ->> 'order_number' !~ '^SLN-[0-9A-F]+-[0-9A-F]{8}$' then
    raise exception '1: unexpected order number %', v ->> 'order_number';
  end if;
  if (v ->> 'subtotal')::numeric <> 96.00 then
    raise exception '1: subtotal % <> 96.00', v ->> 'subtotal';
  end if;
  if (v ->> 'shipping_fee')::numeric <> 0.00 then
    raise exception '1: shipping should be free at $50+';
  end if;
  if (v ->> 'discount')::numeric <> 0 then
    raise exception '1: discount should be 0';
  end if;
  if (v ->> 'total')::numeric <> 96.00 then
    raise exception '1: total % <> 96.00', v ->> 'total';
  end if;
  if v ->> 'status' <> 'pending' then
    raise exception '1: status should be pending';
  end if;
  if (v ->> 'replayed')::boolean is true then
    raise exception '1: first call must not be a replay';
  end if;

  select * into v_order
  from public.orders
  where checkout_idempotency_key = 'it-success-0001';

  if v_order.id is null then
    raise exception '1: order row missing';
  end if;
  if v_order.user_id <> 'a1111111-1111-4111-8111-111111111111' then
    raise exception '1: order is not owned by the caller';
  end if;
  if v_order.shipping_address ->> 'email' <> 'customer.a@example.test' then
    raise exception '1: email was not normalized into the address';
  end if;
  if v_order.shipping_address ->> 'fullName' <> 'Customer A' then
    raise exception '1: address was not trimmed';
  end if;
  if v_order.notes <> 'Leave at door' then
    raise exception '1: notes were not trimmed';
  end if;
  if v_order.status <> 'pending' then
    raise exception '1: stored status should be pending';
  end if;

  select * into v_item
  from public.order_items
  where order_id = v_order.id;

  if v_item.id is null then
    raise exception '1: order item missing';
  end if;
  if v_item.quantity <> 2 or v_item.unit_price <> 48.00 or v_item.total_price <> 96.00 then
    raise exception '1: item pricing is wrong (%)', row_to_json(v_item);
  end if;
  if v_item.product_name <> 'Midnight Garden' or v_item.variant_name <> '220g' then
    raise exception '1: item snapshot is wrong';
  end if;

  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000001') <> 8 then
    raise exception '1: stock was not deducted from 10 to 8';
  end if;

  select * into v_audit
  from public.audit_logs
  where action = 'order.created'
    and resource_id = v_order.id::text;

  if v_audit.id is null then
    raise exception '1: order.created audit row missing';
  end if;
  if v_audit.actor_id <> 'a1111111-1111-4111-8111-111111111111' then
    raise exception '1: audit actor is wrong';
  end if;
  if v_audit.metadata ->> 'idempotencyKey' <> 'it-success-0001' then
    raise exception '1: audit idempotency key missing';
  end if;

  raise notice '1. successful order creation: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 2. Retry with the same key and payload returns the original order
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_original text;
begin
  select order_number into v_original
  from public.orders
  where checkout_idempotency_key = 'it-success-0001';

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'Customer.A@Example.Test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 2),
    'it-success-0001',
    'Leave at door'
  );

  if v ? 'error' then
    raise exception '2: retry errored: %', v ->> 'error';
  end if;
  if (v ->> 'replayed')::boolean is not true then
    raise exception '2: retry was not marked as a replay';
  end if;
  if v ->> 'order_number' <> v_original then
    raise exception '2: retry returned a different order';
  end if;
  if (select count(*) from public.orders
      where checkout_idempotency_key = 'it-success-0001') <> 1 then
    raise exception '2: retry created a duplicate order';
  end if;
  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000001') <> 8 then
    raise exception '2: retry deducted stock twice';
  end if;

  raise notice '2. idempotent retry: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 3. Same key with a different payload is rejected
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 3),
    'it-success-0001',
    'Leave at door'
  );

  if not (v ->> 'error') like 'IDEMPOTENCY_CONFLICT||%' then
    raise exception '3: expected IDEMPOTENCY_CONFLICT, got %', v;
  end if;
  if (select count(*) from public.orders
      where checkout_idempotency_key = 'it-success-0001') <> 1 then
    raise exception '3: conflicting retry created a second order';
  end if;
  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000001') <> 8 then
    raise exception '3: conflicting retry changed stock';
  end if;

  raise notice '3. same key + different payload rejected: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 4. Cart and quantity validation
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    '[]'::jsonb,
    'it-empty-cart-0001'
  );
  if not (v ->> 'error') like 'EMPTY_CART||%' then
    raise exception '4a: expected EMPTY_CART, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    jsonb_build_array(
      jsonb_build_object('variantId', '20000000-0000-4000-8000-000000000001', 'quantity', 1),
      jsonb_build_object('variantId', '20000000-0000-4000-8000-000000000001', 'quantity', 2)
    ),
    'it-duplicate-variant-0001'
  );
  if not (v ->> 'error') like 'DUPLICATE_VARIANT||%' then
    raise exception '4b: expected DUPLICATE_VARIANT, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 0),
    'it-invalid-qty-zero-0001'
  );
  if not (v ->> 'error') like 'INVALID_QUANTITY||%' then
    raise exception '4c: expected INVALID_QUANTITY for 0, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 100),
    'it-invalid-qty-high-0001'
  );
  if not (v ->> 'error') like 'INVALID_QUANTITY||%' then
    raise exception '4d: expected INVALID_QUANTITY for 100, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    jsonb_build_array(jsonb_build_object('variantId', '20000000-0000-4000-8000-000000000001', 'quantity', 1.5)),
    'it-invalid-qty-fraction-0001'
  );
  if not (v ->> 'error') like 'INVALID_QUANTITY||%' then
    raise exception '4e: expected INVALID_QUANTITY for 1.5, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('99999999-9999-4999-8999-999999999999', 1),
    'it-unknown-variant-0001'
  );
  if not (v ->> 'error') like 'VARIANT_NOT_FOUND||%' then
    raise exception '4f: expected VARIANT_NOT_FOUND, got %', v;
  end if;

  raise notice '4. cart/quantity validation: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 5. Inactive product and insufficient stock
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000002', 1),
    'it-inactive-product-0001'
  );
  if not (v ->> 'error') like 'PRODUCT_UNAVAILABLE||%' then
    raise exception '5a: expected PRODUCT_UNAVAILABLE, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000003', 2),
    'it-insufficient-stock-0001'
  );
  if not (v ->> 'error') like 'INSUFFICIENT_STOCK||%' then
    raise exception '5b: expected INSUFFICIENT_STOCK, got %', v;
  end if;
  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000003') <> 1 then
    raise exception '5b: a failed order changed stock';
  end if;

  raise notice '5. inactive product / insufficient stock: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 6. Email, address, notes and key validation
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'not-an-email',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-invalid-email-0001'
  );
  if not (v ->> 'error') like 'INVALID_EMAIL||%' then
    raise exception '6a: expected INVALID_EMAIL, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    jsonb_build_object('phone', '0901234567', 'line1', '123 Le Loi', 'postalCode', '700000', 'country', 'Vietnam'),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-invalid-address-0001'
  );
  if not (v ->> 'error') like 'INVALID_ADDRESS||%' then
    raise exception '6b: expected INVALID_ADDRESS, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-invalid-notes-0001',
    repeat('x', 501)
  );
  if not (v ->> 'error') like 'INVALID_NOTES||%' then
    raise exception '6c: expected INVALID_NOTES, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'short'
  );
  if not (v ->> 'error') like 'IDEMPOTENCY_KEY_INVALID||%' then
    raise exception '6d: expected IDEMPOTENCY_KEY_INVALID, got %', v;
  end if;

  v := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'bad key with spaces'
  );
  if not (v ->> 'error') like 'IDEMPOTENCY_KEY_INVALID||%' then
    raise exception '6e: expected IDEMPOTENCY_KEY_INVALID for spaces, got %', v;
  end if;

  raise notice '6. email/address/notes/key validation: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 7. Authorization: suspended account, wrong role, anon
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.test_checkout(
    'c3333333-3333-4333-8333-333333333333',
    'suspended@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-suspended-0001'
  );
  if not (v ->> 'error') like 'ACCOUNT_INACTIVE||%' then
    raise exception '7a: expected ACCOUNT_INACTIVE, got %', v;
  end if;

  -- Staff does not hold order.create in the seeded RBAC matrix.
  v := public.test_checkout(
    'd4444444-4444-4444-8444-444444444444',
    'staff@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-staff-forbidden-0001'
  );
  if not (v ->> 'error') like 'FORBIDDEN||%' then
    raise exception '7b: expected FORBIDDEN for staff, got %', v;
  end if;

  if has_function_privilege(
    'anon',
    'public.create_order(text, jsonb, jsonb, text, text)',
    'EXECUTE'
  ) then
    raise exception '7c: anon can execute create_order';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.create_order(text, jsonb, jsonb, text, text)',
    'EXECUTE'
  ) then
    raise exception '7d: authenticated cannot execute create_order';
  end if;

  raise notice '7. authorization: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 8. Direct INSERT is denied; service_role still works
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
do $$
begin
  begin
    insert into public.orders (
      user_id, order_number, subtotal, total, shipping_address
    ) values (
      'a1111111-1111-4111-8111-111111111111', 'HACK-0001', 0, 0, '{}'::jsonb
    );
    raise exception '8a: authenticated INSERT on orders was allowed';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;

  begin
    insert into public.order_items (
      order_id, product_id, variant_id, product_name, quantity, unit_price, total_price
    ) values (
      gen_random_uuid(),
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'Forged', 1, 0.01, 0.01
    );
    raise exception '8b: authenticated INSERT on order_items was allowed';
  exception when others then
    if sqlstate <> '42501' then
      raise;
    end if;
  end;
end $$;
reset role;
rollback;

begin;
set local role service_role;
do $$
declare
  v_order_id uuid;
begin
  insert into public.orders (
    user_id, order_number, subtotal, total, shipping_address
  ) values (
    'a1111111-1111-4111-8111-111111111111', 'ADMIN-0001', 1, 1, '{}'::jsonb
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, variant_id, product_name, quantity, unit_price, total_price
  ) values (
    v_order_id,
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Admin line', 1, 1, 1
  );

  raise notice '8c: service_role INSERT still works: PASS';
end $$;
reset role;
rollback;

-- ---------------------------------------------------------------------------
-- 9. Failure during creation rolls back order, items and stock
-- ---------------------------------------------------------------------------
begin;

create or replace function public.test_fail_audit()
returns trigger
language plpgsql
as $$
begin
  if new.action = 'order.created'
     and new.metadata ->> 'idempotencyKey' = 'it-audit-failure-0001' then
    raise exception 'TEST_AUDIT_FAILURE';
  end if;
  return new;
end $$;

create trigger test_fail_audit
  before insert on public.audit_logs
  for each row execute function public.test_fail_audit();

do $$
declare
  v jsonb;
begin
  v := public.test_checkout(
    'b2222222-2222-4222-8222-222222222222',
    'customer.b@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000004', 2),
    'it-audit-failure-0001'
  );

  if not (v ->> 'error') like 'TEST_AUDIT_FAILURE%' then
    raise exception '9a: expected the injected failure, got %', v;
  end if;

  if exists (
    select 1 from public.orders
    where checkout_idempotency_key = 'it-audit-failure-0001'
  ) then
    raise exception '9b: failed order row was left behind';
  end if;

  if exists (
    select 1
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.checkout_idempotency_key = 'it-audit-failure-0001'
  ) then
    raise exception '9c: failed order items were left behind';
  end if;

  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000004') <> 100 then
    raise exception '9d: failed order still deducted stock';
  end if;

  raise notice '9. failure rollback: PASS';
end $$;

drop trigger test_fail_audit on public.audit_logs;
drop function public.test_fail_audit();

rollback;

-- ---------------------------------------------------------------------------
-- 10. Existing cancellation + stock restoration still works
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
  v_order record;
  v_cancel jsonb;
begin
  v := public.test_checkout(
    'b2222222-2222-4222-8222-222222222222',
    'customer.b@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000004', 2),
    'it-cancel-0001'
  );

  if v ? 'error' then
    raise exception '10a: create failed: %', v ->> 'error';
  end if;

  select * into v_order
  from public.orders
  where checkout_idempotency_key = 'it-cancel-0001';

  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000004') <> 98 then
    raise exception '10b: stock was not deducted before cancellation';
  end if;

  v_cancel := public.test_cancel(
    'e5555555-5555-4555-8555-555555555555',
    v_order.id,
    'integration test cancellation'
  );

  if v_cancel ? 'error' then
    raise exception '10c: cancel failed: %', v_cancel ->> 'error';
  end if;

  if (select status from public.orders where id = v_order.id) <> 'cancelled' then
    raise exception '10d: order was not cancelled';
  end if;
  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000004') <> 100 then
    raise exception '10e: cancellation did not restore stock';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where action = 'order.cancelled' and resource_id = v_order.id::text
  ) then
    raise exception '10f: cancellation audit row missing';
  end if;
  if not exists (
    select 1 from public.order_outbox_events
    where order_id = v_order.id and event_type = 'order.cancelled'
  ) then
    raise exception '10g: cancellation outbox event missing';
  end if;

  raise notice '10. cancellation + stock restoration: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 11. The last available unit cannot be sold twice
-- ---------------------------------------------------------------------------
-- This is a sequential simulation of two buyers racing for one unit. The
-- concurrent guarantee comes from the FOR UPDATE lock in create_order() plus
-- the stock check performed while that lock is held; this scenario proves the
-- invariant (one order, one deduction, second buyer rejected) end to end.
do $$
declare
  v_a jsonb;
  v_b jsonb;
begin
  v_a := public.test_checkout(
    'a1111111-1111-4111-8111-111111111111',
    'customer.a@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000003', 1),
    'it-last-stock-a'
  );

  if v_a ? 'error' then
    raise exception '11a: first buyer failed: %', v_a ->> 'error';
  end if;
  if (select stock_quantity from public.product_variants
      where id = '20000000-0000-4000-8000-000000000003') <> 0 then
    raise exception '11b: the last unit was not deducted';
  end if;

  v_b := public.test_checkout(
    'b2222222-2222-4222-8222-222222222222',
    'customer.b@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000003', 1),
    'it-last-stock-b'
  );

  if not (v_b ->> 'error') like 'INSUFFICIENT_STOCK||%' then
    raise exception '11c: second buyer was not rejected: %', v_b;
  end if;

  if (
    select count(*)
    from public.order_items
    where variant_id = '20000000-0000-4000-8000-000000000003'
  ) <> 1 then
    raise exception '11d: more than one unit was sold';
  end if;

  raise notice '11. last-unit oversell guard: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 12. Paid shipping for a small order (pricing rule preserved)
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb;
begin
  v := public.test_checkout(
    'b2222222-2222-4222-8222-222222222222',
    'customer.b@example.test',
    public.test_address(),
    public.test_items('20000000-0000-4000-8000-000000000001', 1),
    'it-paid-shipping-0001'
  );

  if v ? 'error' then
    raise exception '12: unexpected error: %', v ->> 'error';
  end if;
  if (v ->> 'subtotal')::numeric <> 48.00 then
    raise exception '12: subtotal wrong';
  end if;
  if (v ->> 'shipping_fee')::numeric <> 5.99 then
    raise exception '12: expected 5.99 shipping, got %', v ->> 'shipping_fee';
  end if;
  if (v ->> 'total')::numeric <> 53.99 then
    raise exception '12: expected 53.99 total, got %', v ->> 'total';
  end if;

  raise notice '12. paid shipping pricing: PASS';
end $$;

-- ---------------------------------------------------------------------------
-- 13. RLS still isolates the RPC-created order to its owner
-- ---------------------------------------------------------------------------
do $$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
  execute 'set local role authenticated';
  select count(*) into v_count
  from public.orders
  where checkout_idempotency_key = 'it-success-0001';
  execute 'reset role';

  if v_count <> 1 then
    raise exception '13a: owner cannot read their RPC-created order (% rows)', v_count;
  end if;

  perform set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
  execute 'set local role authenticated';
  select count(*) into v_count
  from public.orders
  where checkout_idempotency_key = 'it-success-0001';
  execute 'reset role';

  if v_count <> 0 then
    raise exception '13b: another customer can read the order (% rows)', v_count;
  end if;

  raise notice '13. customer ownership isolation: PASS';
end $$;

do $$
begin
  raise notice '--- Solenne 0016 integration suite: ALL CHECKS PASSED ---';
end $$;
