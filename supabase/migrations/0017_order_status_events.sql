-- ===================================================
-- Solenne — 0017: order status history & customer/admin timeline
-- ===================================================
-- Apply after 0001–0016. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Orders had a current status but no durable history. Customers and
--      support could not see when an order moved between statuses, who moved
--      it, why, or which tracking code accompanied a shipment.
--   2. This adds public.order_status_events as the single append-only history
--      for every order. Writes are database-owned: the SECURITY DEFINER RPCs
--      already trusted for creation, fulfillment and cancellation record the
--      event in the SAME transaction as the order mutation. A failed
--      transition therefore leaves neither an order change nor an event.
--   3. Existing orders are backfilled ONCE with only the status known at
--      migration time. source = 'backfill' and from_status = NULL make it
--      explicit that no earlier transitions are being invented.
--   4. RLS lets customers read events for their own orders only, while
--      staff/manager/admin with order.read see the full history. There is no
--      INSERT/UPDATE/DELETE grant or policy for anon/authenticated, so the
--      Supabase Data API cannot rewrite history.
-- ===================================================

-- ===================================================
-- 1. Append-only status history
-- ===================================================
create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  reason text,
  tracking_code text,
  source text not null default 'transition',
  created_at timestamptz not null default now(),
  constraint order_status_events_from_status_chk check (
    from_status is null
    or from_status in ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')
  ),
  constraint order_status_events_to_status_chk check (
    to_status in ('pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled')
  ),
  constraint order_status_events_source_chk check (
    source in ('creation', 'transition', 'cancellation', 'backfill')
  ),
  constraint order_status_events_distinct_status_chk check (
    from_status is null or from_status <> to_status
  )
);

comment on table public.order_status_events is
  'Append-only order status history. Written only by SECURITY DEFINER order RPCs.';
comment on column public.order_status_events.source is
  'creation | transition | cancellation | backfill. Backfill rows represent only the status known at migration time.';
comment on column public.order_status_events.actor_user_id is
  'Caller derived from auth.uid() inside the RPC. NULL for backfill/system events.';

-- Timeline read path: one order, oldest first, deterministic tie-break.
create index if not exists order_status_events_order_timeline_idx
  on public.order_status_events (order_id, created_at asc, id asc);
create index if not exists order_status_events_actor_idx
  on public.order_status_events (actor_user_id)
  where actor_user_id is not null;

-- Exactly one creation event and one backfill row per order. These are
-- invariants, not just optimisations: a retry must never duplicate history.
create unique index if not exists order_status_events_one_creation_uidx
  on public.order_status_events (order_id)
  where source = 'creation';
create unique index if not exists order_status_events_one_backfill_uidx
  on public.order_status_events (order_id)
  where source = 'backfill';

-- ===================================================
-- 2. RLS and least-privilege grants
-- ===================================================
alter table public.order_status_events enable row level security;

-- Customers read only events whose parent order belongs to them.
drop policy if exists order_status_events_select_own on public.order_status_events;
create policy order_status_events_select_own on public.order_status_events
  for select to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_status_events.order_id
        and o.user_id = auth.uid()
    )
  );

-- Staff/manager/admin read any order's history exactly when order.read is held.
drop policy if exists order_status_events_select_with_order_read on public.order_status_events;
create policy order_status_events_select_with_order_read on public.order_status_events
  for select to authenticated
  using (public.has_permission('order.read'));

-- History is database-written. No INSERT/UPDATE/DELETE policy exists, and the
-- API roles lose every write privilege below. There is no UPDATE grant, so a
-- transition can never be rewritten after the fact.
revoke all on public.order_status_events from public, anon, authenticated, service_role;

-- Customers may read only the fields the timeline renders. `actor_user_id` and
-- `reason` are deliberately NOT granted: the customer UI does not show them,
-- and column privileges keep them out of direct PostgREST reads too. The
-- management timeline reaches them through the order.read-gated RPC below.
revoke select on table public.order_status_events from authenticated;
grant select (
  id,
  order_id,
  from_status,
  to_status,
  tracking_code,
  source,
  created_at
) on public.order_status_events to authenticated;
grant select on public.order_status_events to service_role;

-- ===================================================
-- 3. Transactions record their own history
-- ===================================================
-- The functions below are the current trusted definitions (0016 for creation,
-- 0007 for fulfillment, 0008 for cancellation) with one in-transaction history
-- insert added. All existing validation, authorization, audit, stock and
-- outbox behaviour is preserved verbatim.

create or replace function public.create_order(
  p_email text,
  p_shipping_address jsonb,
  p_items jsonb,
  p_idempotency_key text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();

  v_email text;
  v_key text;
  v_notes text;

  -- Normalized shipping address (only the known keys, trimmed).
  v_full_name text;
  v_phone text;
  v_line1 text;
  v_line2 text;
  v_city text;
  v_state text;
  v_postal_code text;
  v_country text;
  v_country_code text;
  v_province_code text;
  v_ward_code text;
  v_administrative_type text;
  v_province_name text;
  v_ward_name text;

  v_item_count integer;
  v_elem record;
  v_variant_text text;
  v_variant_id uuid;
  v_quantity_num numeric;
  v_variant_ids uuid[] := '{}';
  v_quantities integer[] := '{}';
  v_normalized_items jsonb;
  v_normalized_address jsonb;
  v_canonical jsonb;
  v_payload_hash text;

  v_existing record;

  v_line record;
  v_variant record;
  v_line_product_ids uuid[] := '{}';
  v_line_variant_ids uuid[] := '{}';
  v_line_product_names text[] := '{}';
  v_line_variant_names text[] := '{}';
  v_line_quantities integer[] := '{}';
  v_line_unit_prices numeric[] := '{}';
  v_line_totals numeric[] := '{}';
  v_line_stocks integer[] := '{}';

  v_subtotal numeric(12,2) := 0;
  v_shipping_fee numeric(12,2);
  v_total numeric(12,2);

  v_attempt integer;
  v_max_attempts constant integer := 5;
  v_order_id uuid;
  v_order_number text;
  v_inserted boolean := false;
  v_index integer;
begin
  -- ------------------------------------------------------------------
  -- Authorization. The caller is the JWT subject; no id is accepted from
  -- the payload. Suspended/banned/pending accounts fail is_active_account(),
  -- and has_permission() independently re-checks the active status.
  -- ------------------------------------------------------------------
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED||Please sign in to place an order.'
      using errcode = '28000';
  end if;

  if not public.is_active_account() then
    raise exception 'ACCOUNT_INACTIVE||This account is not active. Please contact support.'
      using errcode = '42501';
  end if;

  if not public.has_permission('order.create') then
    raise exception 'FORBIDDEN||You do not have permission to place orders.'
      using errcode = '42501';
  end if;

  -- ------------------------------------------------------------------
  -- Input validation (fail-closed, before any row is touched).
  -- ------------------------------------------------------------------
  v_email := btrim(p_email);
  if v_email is null
     or length(v_email) < 3
     or length(v_email) > 254
     or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'INVALID_EMAIL||Please enter a valid email address.'
      using errcode = '22000';
  end if;
  v_email := lower(v_email);

  v_key := btrim(p_idempotency_key);
  if v_key is null or v_key = '' then
    raise exception 'IDEMPOTENCY_KEY_REQUIRED||A checkout key is required.'
      using errcode = '22000';
  end if;
  if length(v_key) < 8 or length(v_key) > 128 or v_key !~ '^[A-Za-z0-9._:-]+$' then
    raise exception 'IDEMPOTENCY_KEY_INVALID||The checkout key is invalid.'
      using errcode = '22000';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and length(v_notes) > 500 then
    raise exception 'INVALID_NOTES||Order notes cannot exceed 500 characters.'
      using errcode = '22000';
  end if;

  if p_shipping_address is null
     or jsonb_typeof(p_shipping_address) <> 'object' then
    raise exception 'INVALID_ADDRESS||Please check your shipping details.'
      using errcode = '22000';
  end if;

  if jsonb_typeof(p_shipping_address -> 'fullName') <> 'string'
     or jsonb_typeof(p_shipping_address -> 'phone') <> 'string'
     or jsonb_typeof(p_shipping_address -> 'line1') <> 'string'
     or jsonb_typeof(p_shipping_address -> 'postalCode') <> 'string'
     or jsonb_typeof(p_shipping_address -> 'country') <> 'string' then
    raise exception 'INVALID_ADDRESS||Please check your shipping details.'
      using errcode = '22000';
  end if;

  -- Optional address fields may be absent or JSON null, but never a non-string.
  if (p_shipping_address ? 'line2' and jsonb_typeof(p_shipping_address -> 'line2') not in ('string', 'null'))
     or (p_shipping_address ? 'city' and jsonb_typeof(p_shipping_address -> 'city') not in ('string', 'null'))
     or (p_shipping_address ? 'state' and jsonb_typeof(p_shipping_address -> 'state') not in ('string', 'null'))
     or (p_shipping_address ? 'countryCode' and jsonb_typeof(p_shipping_address -> 'countryCode') not in ('string', 'null'))
     or (p_shipping_address ? 'provinceCode' and jsonb_typeof(p_shipping_address -> 'provinceCode') not in ('string', 'null'))
     or (p_shipping_address ? 'wardCode' and jsonb_typeof(p_shipping_address -> 'wardCode') not in ('string', 'null'))
     or (p_shipping_address ? 'administrativeType' and jsonb_typeof(p_shipping_address -> 'administrativeType') not in ('string', 'null'))
     or (p_shipping_address ? 'provinceName' and jsonb_typeof(p_shipping_address -> 'provinceName') not in ('string', 'null'))
     or (p_shipping_address ? 'wardName' and jsonb_typeof(p_shipping_address -> 'wardName') not in ('string', 'null')) then
    raise exception 'INVALID_ADDRESS||Please check your shipping details.'
      using errcode = '22000';
  end if;

  v_full_name := btrim(p_shipping_address ->> 'fullName');
  v_phone := btrim(p_shipping_address ->> 'phone');
  v_line1 := btrim(p_shipping_address ->> 'line1');
  v_line2 := nullif(btrim(p_shipping_address ->> 'line2'), '');
  v_city := nullif(btrim(p_shipping_address ->> 'city'), '');
  v_state := nullif(btrim(p_shipping_address ->> 'state'), '');
  v_postal_code := btrim(p_shipping_address ->> 'postalCode');
  v_country := btrim(p_shipping_address ->> 'country');
  v_country_code := nullif(btrim(p_shipping_address ->> 'countryCode'), '');
  v_province_code := nullif(btrim(p_shipping_address ->> 'provinceCode'), '');
  v_ward_code := nullif(btrim(p_shipping_address ->> 'wardCode'), '');
  v_administrative_type := nullif(btrim(p_shipping_address ->> 'administrativeType'), '');
  v_province_name := nullif(btrim(p_shipping_address ->> 'provinceName'), '');
  v_ward_name := nullif(btrim(p_shipping_address ->> 'wardName'), '');

  if length(v_full_name) < 2 or length(v_full_name) > 70
     or length(v_phone) < 6 or length(v_phone) > 20
     or length(v_line1) < 4 or length(v_line1) > 500
     or length(v_postal_code) < 3 or length(v_postal_code) > 12
     or length(v_country) < 2 or length(v_country) > 70
     or (v_line2 is not null and length(v_line2) > 100)
     or (v_city is not null and length(v_city) > 70)
     or (v_state is not null and length(v_state) > 70)
     or (v_country_code is not null and length(v_country_code) > 8)
     or (v_province_code is not null and length(v_province_code) > 40)
     or (v_ward_code is not null and length(v_ward_code) > 40)
     or (v_administrative_type is not null and length(v_administrative_type) > 40)
     or (v_province_name is not null and length(v_province_name) > 70)
     or (v_ward_name is not null and length(v_ward_name) > 70) then
    raise exception 'INVALID_ADDRESS||Please check your shipping details.'
      using errcode = '22000';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVALID_ITEMS||Your cart contains an invalid item.'
      using errcode = '22000';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count = 0 then
    raise exception 'EMPTY_CART||Your cart is empty.'
      using errcode = '22000';
  end if;
  if v_item_count > 100 then
    raise exception 'TOO_MANY_ITEMS||Your cart contains too many items.'
      using errcode = '22000';
  end if;

  for v_elem in
    select value as item from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_elem.item) <> 'object' then
      raise exception 'INVALID_ITEMS||Your cart contains an invalid item.'
        using errcode = '22000';
    end if;

    if jsonb_typeof(v_elem.item -> 'quantity') <> 'number' then
      raise exception 'INVALID_QUANTITY||Quantity must be a whole number between 1 and 99.'
        using errcode = '22000';
    end if;

    v_quantity_num := (v_elem.item ->> 'quantity')::numeric;
    if v_quantity_num <> trunc(v_quantity_num)
       or v_quantity_num < 1
       or v_quantity_num > 99 then
      raise exception 'INVALID_QUANTITY||Quantity must be a whole number between 1 and 99.'
        using errcode = '22000';
    end if;

    v_variant_text := nullif(btrim(v_elem.item ->> 'variantId'), '');
    if v_variant_text is null
       or v_variant_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_VARIANT_ID||One of the items in your cart is no longer available.'
        using errcode = '22000';
    end if;

    v_variant_ids := array_append(v_variant_ids, v_variant_text::uuid);
    v_quantities := array_append(v_quantities, v_quantity_num::integer);
  end loop;

  if (
    select count(distinct x)
    from unnest(v_variant_ids) as x
  ) <> v_item_count then
    raise exception 'DUPLICATE_VARIANT||Your cart contains duplicate items. Please refresh and try again.'
      using errcode = '22000';
  end if;

  -- Canonical, order-independent representation used for the payload hash.
  select jsonb_agg(
           jsonb_build_object(
             'variantId', pairs.variant_id,
             'quantity', pairs.quantity
           )
           order by pairs.variant_id
         )
    into v_normalized_items
  from unnest(v_variant_ids, v_quantities) as pairs(variant_id, quantity);

  v_normalized_address := jsonb_build_object(
    'fullName', v_full_name,
    'phone', v_phone,
    'line1', v_line1,
    'line2', v_line2,
    'city', v_city,
    'state', v_state,
    'postalCode', v_postal_code,
    'country', v_country,
    'countryCode', v_country_code,
    'provinceCode', v_province_code,
    'wardCode', v_ward_code,
    'administrativeType', v_administrative_type,
    'provinceName', v_province_name,
    'wardName', v_ward_name
  );

  v_canonical := jsonb_build_object(
    'email', v_email,
    'shippingAddress', v_normalized_address,
    'notes', v_notes,
    'items', v_normalized_items
  );
  v_payload_hash := encode(sha256(convert_to(v_canonical::text, 'UTF8')), 'hex');

  -- ------------------------------------------------------------------
  -- Fast replay path: a completed checkout with this key returns the
  -- original order before any inventory check runs, so a retry cannot fail
  -- because the stock it already consumed is now gone.
  -- ------------------------------------------------------------------
  select o.id,
         o.order_number,
         o.status,
         o.subtotal,
         o.shipping_fee,
         o.discount,
         o.total,
         o.checkout_payload_hash
    into v_existing
  from public.orders o
  where o.user_id = v_actor_id
    and o.checkout_idempotency_key = v_key
  limit 1;

  if v_existing.id is not null then
    if v_existing.checkout_payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT||This checkout was already submitted with different details. Please refresh your cart and try again.'
        using errcode = '22000';
    end if;

    return jsonb_build_object(
      'success', true,
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'subtotal', v_existing.subtotal,
      'shipping_fee', v_existing.shipping_fee,
      'discount', v_existing.discount,
      'total', v_existing.total,
      'currency', 'USD',
      'item_count', v_item_count,
      'replayed', true
    );
  end if;

  -- ------------------------------------------------------------------
  -- Lock every requested variant in a deterministic (uuid asc) order and
  -- re-read all price/eligibility data from the database. No price or stock
  -- value is accepted from the caller.
  -- ------------------------------------------------------------------
  for v_line in
    select pairs.variant_id, pairs.quantity
    from unnest(v_variant_ids, v_quantities) as pairs(variant_id, quantity)
    order by pairs.variant_id
  loop
    select pv.id,
           pv.product_id,
           pv.name as variant_name,
           pv.price,
           pv.stock_quantity,
           p.name as product_name,
           p.is_active
      into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = v_line.variant_id
    for update of pv;

    if not found then
      raise exception 'VARIANT_NOT_FOUND||One of the items in your cart is no longer available.'
        using errcode = 'P0002';
    end if;

    if v_variant.price is null or v_variant.price < 0 then
      raise exception 'VARIANT_NOT_FOUND||One of the items in your cart is no longer available.'
        using errcode = 'P0002';
    end if;

    if v_variant.is_active is not true then
      raise exception 'PRODUCT_UNAVAILABLE||% is no longer available.',
        v_variant.product_name
        using errcode = '22000';
    end if;

    v_line_product_ids := array_append(v_line_product_ids, v_variant.product_id);
    v_line_variant_ids := array_append(v_line_variant_ids, v_variant.id);
    v_line_product_names := array_append(v_line_product_names, v_variant.product_name);
    v_line_variant_names := array_append(v_line_variant_names, v_variant.variant_name);
    v_line_quantities := array_append(v_line_quantities, v_line.quantity);
    v_line_unit_prices := array_append(v_line_unit_prices, round(v_variant.price, 2));
    v_line_totals := array_append(
      v_line_totals,
      round(v_variant.price * v_line.quantity, 2)
    );
    v_line_stocks := array_append(
      v_line_stocks,
      coalesce(v_variant.stock_quantity, 0)
    );

    v_subtotal := v_subtotal + round(v_variant.price * v_line.quantity, 2);
  end loop;

  -- The locks above may have serialized us behind a request that used the same
  -- key. Re-check after acquiring them: if that request committed the order,
  -- this retry must return it instead of failing on exhausted stock.
  select o.id,
         o.order_number,
         o.status,
         o.subtotal,
         o.shipping_fee,
         o.discount,
         o.total,
         o.checkout_payload_hash
    into v_existing
  from public.orders o
  where o.user_id = v_actor_id
    and o.checkout_idempotency_key = v_key
  limit 1;

  if v_existing.id is not null then
    if v_existing.checkout_payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_CONFLICT||This checkout was already submitted with different details. Please refresh your cart and try again.'
        using errcode = '22000';
    end if;

    return jsonb_build_object(
      'success', true,
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'status', v_existing.status,
      'subtotal', v_existing.subtotal,
      'shipping_fee', v_existing.shipping_fee,
      'discount', v_existing.discount,
      'total', v_existing.total,
      'currency', 'USD',
      'item_count', v_item_count,
      'replayed', true
    );
  end if;

  -- Stock is checked only after the replay re-check, so a retry that lost the
  -- race for the last unit still receives its original order.
  for v_index in 1 .. array_length(v_line_variant_ids, 1) loop
    if v_line_stocks[v_index] < v_line_quantities[v_index] then
      raise exception 'INSUFFICIENT_STOCK||Only % left of % (%). Please adjust your cart.',
        v_line_stocks[v_index],
        v_line_product_names[v_index],
        v_line_variant_names[v_index]
        using errcode = '22000';
    end if;
  end loop;

  v_shipping_fee := case when v_subtotal >= 50.00 then 0.00 else 5.99 end;
  v_total := v_subtotal + v_shipping_fee;

  -- ------------------------------------------------------------------
  -- Insert the order. A conflict can be:
  --   * (user_id, checkout_idempotency_key) — a concurrent retry won;
  --   * orders.order_number — a vanishingly unlikely number collision.
  -- ON CONFLICT DO NOTHING makes the retry path wait for the competing
  -- transaction instead of failing, and returning no row lets us tell the
  -- two cases apart by looking the key up again.
  -- ------------------------------------------------------------------
  for v_attempt in 1 .. v_max_attempts loop
    v_order_id := null;

    v_order_number :=
      'SLN-'
      || upper(to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint))
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.orders (
      user_id,
      order_number,
      status,
      subtotal,
      shipping_fee,
      discount,
      total,
      shipping_address,
      notes,
      checkout_idempotency_key,
      checkout_payload_hash
    ) values (
      v_actor_id,
      v_order_number,
      'pending',
      v_subtotal,
      v_shipping_fee,
      0,
      v_total,
      v_normalized_address || jsonb_build_object('email', v_email),
      v_notes,
      v_key,
      v_payload_hash
    )
    on conflict do nothing
    returning id into v_order_id;

    if v_order_id is not null then
      v_inserted := true;
      exit;
    end if;

    -- No row inserted: either a retry with this key won, or the generated
    -- order number collided. Distinguish by re-reading the key.
    select o.id,
           o.order_number,
           o.status,
           o.subtotal,
           o.shipping_fee,
           o.discount,
           o.total,
           o.checkout_payload_hash
      into v_existing
    from public.orders o
    where o.user_id = v_actor_id
      and o.checkout_idempotency_key = v_key
    limit 1;

    if v_existing.id is not null then
      if v_existing.checkout_payload_hash is distinct from v_payload_hash then
        raise exception 'IDEMPOTENCY_CONFLICT||This checkout was already submitted with different details. Please refresh your cart and try again.'
          using errcode = '22000';
      end if;

      return jsonb_build_object(
        'success', true,
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'status', v_existing.status,
        'subtotal', v_existing.subtotal,
        'shipping_fee', v_existing.shipping_fee,
        'discount', v_existing.discount,
        'total', v_existing.total,
        'currency', 'USD',
        'item_count', v_item_count,
        'replayed', true
      );
    end if;

    -- Otherwise the order number collided; loop and generate another.
  end loop;

  if not v_inserted then
    raise exception 'ORDER_NUMBER_GENERATION_FAILED||We could not reserve an order number. Please try again.'
      using errcode = '40000';
  end if;

  -- ------------------------------------------------------------------
  -- Line items, stock deduction and the audit row. Any failure here raises,
  -- and PostgreSQL rolls back the order, its items and every stock change
  -- because they all belong to this single function invocation.
  -- ------------------------------------------------------------------
  for v_index in 1 .. array_length(v_line_variant_ids, 1) loop
    insert into public.order_items (
      order_id,
      product_id,
      variant_id,
      product_name,
      variant_name,
      quantity,
      unit_price,
      total_price
    ) values (
      v_order_id,
      v_line_product_ids[v_index],
      v_line_variant_ids[v_index],
      v_line_product_names[v_index],
      v_line_variant_names[v_index],
      v_line_quantities[v_index],
      v_line_unit_prices[v_index],
      v_line_totals[v_index]
    );

    update public.product_variants
    set stock_quantity = stock_quantity - v_line_quantities[v_index]
    where id = v_line_variant_ids[v_index];

    if not found then
      raise exception 'VARIANT_NOT_FOUND||One of the items in your cart is no longer available.'
        using errcode = 'P0002';
    end if;
  end loop;

  -- Record the initial status in the same transaction as the order.
  insert into public.order_status_events (
    order_id,
    from_status,
    to_status,
    actor_user_id,
    reason,
    tracking_code,
    source
  ) values (
    v_order_id,
    null,
    'pending',
    v_actor_id,
    null,
    null,
    'creation'
  );

  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_actor_id,
    'order.created',
    'order',
    v_order_id::text,
    jsonb_build_object(
      'orderNumber', v_order_number,
      'itemCount', v_item_count,
      'subtotal', v_subtotal,
      'shippingFee', v_shipping_fee,
      'total', v_total,
      'currency', 'USD',
      'status', 'pending',
      'idempotencyKey', v_key
    )
  );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'status', 'pending',
    'subtotal', v_subtotal,
    'shipping_fee', v_shipping_fee,
    'discount', 0,
    'total', v_total,
    'currency', 'USD',
    'item_count', v_item_count,
    'replayed', false
  );
end;
$$;

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

    -- Record this transition in the same transaction as the order update.
    insert into public.order_status_events (
      order_id,
      from_status,
      to_status,
      actor_user_id,
      reason,
      tracking_code,
      source
    ) values (
      p_order_id,
      v_order.status,
      p_target_status,
      v_actor_id,
      v_trimmed_reason,
      v_tracking_after,
      'transition'
    );

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

    -- Record this transition in the same transaction as the order update.
    insert into public.order_status_events (
      order_id,
      from_status,
      to_status,
      actor_user_id,
      reason,
      tracking_code,
      source
    ) values (
      p_order_id,
      v_order.status,
      p_target_status,
      v_actor_id,
      v_trimmed_reason,
      v_tracking_after,
      'transition'
    );

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
  v_outbox_id uuid;
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
  select id, order_number, status, tracking_code
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

  -- Record the cancellation in the same transaction as the status update.
  insert into public.order_status_events (
    order_id,
    from_status,
    to_status,
    actor_user_id,
    reason,
    tracking_code,
    source
  ) values (
    p_order_id,
    v_order.status,
    'cancelled',
    v_actor_id,
    v_reason,
    v_order.tracking_code,
    'cancellation'
  );

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

  -- 8. Enqueue durable notification outbox event within the same transaction
  insert into public.order_outbox_events (
    order_id,
    event_type,
    payload,
    status
  ) values (
    p_order_id,
    'order.cancelled',
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order.order_number,
      'previous_status', v_order.status,
      'new_status', 'cancelled',
      'reason', v_reason,
      'items_restored', v_restored_count,
      'actor_id', v_actor_id
    ),
    'pending'
  ) returning id into v_outbox_id;

  return jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'previous_status', v_order.status,
    'items_restored', v_restored_count,
    'outbox_event_id', v_outbox_id
  );
end;
$$;

-- ===================================================
-- 3b. Management-only reader for the hidden columns
-- ===================================================
-- `authenticated` has column-level SELECT only (no reason/actor). Staff,
-- managers and admins still need the full history for the back-office
-- timeline, so this SECURITY DEFINER function re-checks order.read and returns
-- the complete row set. Customers are explicitly refused, including for their
-- own orders, because actor/reason are internal operational data.
create or replace function public.get_order_status_events_admin(
  p_order_id uuid
)
returns setof public.order_status_events
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if not public.has_permission('order.read') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  return query
    select e.*
    from public.order_status_events e
    where e.order_id = p_order_id
    order by e.created_at asc, e.id asc;
end;
$$;

-- Re-assert the execution boundary: only authenticated (and the trusted
-- service path) may call these RPCs.
revoke all on function public.create_order(text, jsonb, jsonb, text, text) from public;
revoke all on function public.create_order(text, jsonb, jsonb, text, text) from anon;
grant execute on function public.create_order(text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.create_order(text, jsonb, jsonb, text, text) to service_role;

revoke all on function public.update_order_status(uuid, text, text, text) from public;
revoke all on function public.update_order_status(uuid, text, text, text) from anon;
grant execute on function public.update_order_status(uuid, text, text, text) to authenticated;
grant execute on function public.update_order_status(uuid, text, text, text) to service_role;

revoke all on function public.cancel_order(uuid, text) from public;
revoke all on function public.cancel_order(uuid, text) from anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to service_role;

revoke all on function public.get_order_status_events_admin(uuid) from public;
revoke all on function public.get_order_status_events_admin(uuid) from anon;
grant execute on function public.get_order_status_events_admin(uuid) to authenticated;
grant execute on function public.get_order_status_events_admin(uuid) to service_role;

-- ===================================================
-- 4. One-time backfill — current status only, never invented history
-- ===================================================
-- A backfilled row has from_status = NULL, source = 'backfill', actor = NULL,
-- and created_at = migration time. It says "this is the status we found", not
-- "this transition happened now". Orders that already have any event are left
-- untouched, so re-running the migration cannot duplicate history.
insert into public.order_status_events (
  order_id,
  from_status,
  to_status,
  actor_user_id,
  reason,
  tracking_code,
  source,
  created_at
)
select
  o.id,
  null,
  o.status,
  null,
  null,
  o.tracking_code,
  'backfill',
  now()
from public.orders o
where not exists (
  select 1
  from public.order_status_events e
  where e.order_id = o.id
);

-- ===================================================
-- 5. Self-verification — fail loudly instead of half-applying
-- ===================================================
do $$
declare
  is_rls boolean;
  select_policies int;
  write_policies int;
  missing_backfill int;
  functions_without_table text;
begin
  if to_regclass('public.order_status_events') is null then
    raise exception 'Migration 0017 failed: public.order_status_events does not exist';
  end if;

  select relrowsecurity into is_rls
  from pg_class
  where oid = 'public.order_status_events'::regclass;

  if is_rls is not true then
    raise exception 'Migration 0017 failed: RLS is not enabled on order_status_events';
  end if;

  select count(*) into select_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'order_status_events'
    and cmd = 'SELECT';

  if select_policies <> 2 then
    raise exception 'Migration 0017 failed: expected exactly 2 SELECT policies, found %', select_policies;
  end if;

  select count(*) into write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'order_status_events'
    and cmd in ('INSERT', 'UPDATE', 'DELETE');

  if write_policies <> 0 then
    raise exception 'Migration 0017 failed: % write policy/policies exist on order_status_events', write_policies;
  end if;

  if has_table_privilege('authenticated', 'public.order_status_events', 'SELECT') then
    raise exception 'Migration 0017 failed: authenticated must not have table-level SELECT on order_status_events';
  end if;

  if not (
    has_column_privilege('authenticated', 'public.order_status_events', 'id', 'SELECT')
    and has_column_privilege('authenticated', 'public.order_status_events', 'order_id', 'SELECT')
    and has_column_privilege('authenticated', 'public.order_status_events', 'from_status', 'SELECT')
    and has_column_privilege('authenticated', 'public.order_status_events', 'to_status', 'SELECT')
    and has_column_privilege('authenticated', 'public.order_status_events', 'tracking_code', 'SELECT')
    and has_column_privilege('authenticated', 'public.order_status_events', 'source', 'SELECT')
    and has_column_privilege('authenticated', 'public.order_status_events', 'created_at', 'SELECT')
  ) then
    raise exception 'Migration 0017 failed: authenticated lacks a granted timeline column';
  end if;

  if has_column_privilege('authenticated', 'public.order_status_events', 'actor_user_id', 'SELECT')
     or has_column_privilege('authenticated', 'public.order_status_events', 'reason', 'SELECT') then
    raise exception 'Migration 0017 failed: authenticated can read actor_user_id/reason';
  end if;

  if has_table_privilege('authenticated', 'public.order_status_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.order_status_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.order_status_events', 'DELETE') then
    raise exception 'Migration 0017 failed: authenticated still has a write privilege on order_status_events';
  end if;

  if has_table_privilege('anon', 'public.order_status_events', 'SELECT')
     or has_column_privilege('anon', 'public.order_status_events', 'id', 'SELECT') then
    raise exception 'Migration 0017 failed: anon can read order_status_events';
  end if;

  if not has_table_privilege('service_role', 'public.order_status_events', 'SELECT') then
    raise exception 'Migration 0017 failed: service_role lost SELECT on order_status_events';
  end if;

  if has_table_privilege('service_role', 'public.order_status_events', 'INSERT')
     or has_table_privilege('service_role', 'public.order_status_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.order_status_events', 'DELETE') then
    raise exception 'Migration 0017 failed: service_role still has a write privilege on order_status_events';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_order_status_events_admin'
      and p.prosecdef
      and p.prosrc like '%order.read%'
  ) then
    raise exception 'Migration 0017 failed: get_order_status_events_admin is missing or not hardened';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.get_order_status_events_admin(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Migration 0017 failed: authenticated cannot execute get_order_status_events_admin';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_order_status_events_admin(uuid)',
    'EXECUTE'
  ) then
    raise exception 'Migration 0017 failed: anon can execute get_order_status_events_admin';
  end if;

  if to_regclass('public.order_status_events_one_creation_uidx') is null
     or to_regclass('public.order_status_events_one_backfill_uidx') is null then
    raise exception 'Migration 0017 failed: idempotency indexes are missing';
  end if;

  select string_agg(p.proname, ', ' order by p.proname)
    into functions_without_table
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_order', 'update_order_status', 'cancel_order')
    and p.prosrc not like '%order_status_events%';

  if functions_without_table is not null then
    raise exception 'Migration 0017 failed: functions do not record status events: %', functions_without_table;
  end if;

  select count(*) into missing_backfill
  from public.orders o
  where not exists (
    select 1 from public.order_status_events e where e.order_id = o.id
  );

  if missing_backfill > 0 then
    raise exception 'Migration 0017 failed: % order(s) have no status event', missing_backfill;
  end if;

  raise notice '--- Solenne 0017 OK: order status history, RLS, backfill, and transactional event recording installed ---';
end $$;
