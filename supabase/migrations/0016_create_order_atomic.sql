-- ===================================================
-- Solenne — 0016: atomic, idempotent order creation
-- ===================================================
-- Apply after 0001–0015. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Order creation was a sequence of independent PostgREST requests: insert
--      the order, insert its items, then decrement stock variant by variant.
--      A failure in the middle left an order without items or an order whose
--      stock was never deducted. Every step below now runs inside ONE
--      PostgreSQL function call, so the whole order commits or none of it does.
--   2. `authenticated` held INSERT on public.orders and public.order_items,
--      plus permissive INSERT policies. A signed-in customer could bypass the
--      trusted checkout path and write arbitrary orders/line items (including
--      forged prices and totals) straight through PostgREST. Those grants and
--      policies are removed; the only client-reachable write path is the
--      SECURITY DEFINER RPC below.
--   3. Identity is derived strictly from auth.uid(). The function accepts no
--      user id, no price and no total from the caller — only the product
--      variant ids, their quantities and the customer's delivery details.
--   4. Prices, product eligibility and stock are re-read from the database
--      while the variant rows are locked FOR UPDATE in deterministic order, so
--      two concurrent checkouts cannot oversell the same unit.
--   5. Checkout retries are idempotent. A client-generated key is unique per
--      (user, key); replaying the same key with the same payload returns the
--      original order, and replaying it with a different payload is rejected.
--      The unique index (not the UI) is what makes this safe under concurrency.
--
-- Pricing rules preserved from lib/orders.ts / lib/constants.ts:
--   * unit prices and totals are stored in USD (product_variants.price)
--   * subtotal >= 50.00 USD  -> shipping 0.00
--   * otherwise              -> shipping 5.99
--   * discount is always 0
-- ===================================================

-- ===================================================
-- 1. Order-number uniqueness
-- ===================================================
-- The live table already has unique order numbers, but the guarantee was only
-- application-side (timestamp + 4 random base36 chars). Inspect the data and
-- add a real constraint before relying on it. Duplicates abort the migration
-- with their values printed instead of being silently ignored.
do $$
declare
  v_has_unique boolean;
  v_duplicates text;
begin
  select exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where n.nspname = 'public'
      and c.relname = 'orders'
      and i.indisunique
      and i.indisvalid
      and i.indpred is null
      and i.indexprs is null
      and i.indnkeyatts = 1
      and a.attname = 'order_number'
  ) into v_has_unique;

  if not v_has_unique then
    select string_agg(order_number, ', ' order by order_number)
      into v_duplicates
    from (
      select order_number
      from public.orders
      where order_number is not null
      group by order_number
      having count(*) > 1
    ) duplicates;

    if v_duplicates is not null then
      raise exception
        'Migration 0016 aborted: duplicate order_number values exist (%). Resolve them before adding the unique index.',
        v_duplicates;
    end if;

    create unique index orders_order_number_key
      on public.orders (order_number);
    raise notice '0016: created unique index orders_order_number_key';
  else
    raise notice '0016: orders.order_number is already uniquely indexed';
  end if;
end $$;

-- ===================================================
-- 2. Idempotency columns
-- ===================================================
alter table public.orders
  add column if not exists checkout_idempotency_key text;
alter table public.orders
  add column if not exists checkout_payload_hash text;

comment on column public.orders.checkout_idempotency_key is
  'Client-generated key that makes a checkout retry return the original order. Unique per user.';
comment on column public.orders.checkout_payload_hash is
  'SHA-256 of the canonical validated checkout payload. Detects key reuse with different details.';

-- Both columns are set together or not at all. New orders always set them;
-- legacy rows predate the mechanism and keep NULL.
alter table public.orders
  drop constraint if exists orders_idempotency_pair_chk;
alter table public.orders
  add constraint orders_idempotency_pair_chk check (
    (checkout_idempotency_key is null and checkout_payload_hash is null)
    or (
      checkout_idempotency_key is not null
      and checkout_payload_hash is not null
      and length(checkout_idempotency_key) between 8 and 128
      and checkout_idempotency_key ~ '^[A-Za-z0-9._:-]+$'
      and checkout_payload_hash ~ '^[0-9a-f]{64}$'
    )
  );

-- The concurrency guarantee for retries. Partial so legacy rows (NULL key) do
-- not collide with each other. `on conflict do nothing` in create_order()
-- arbiter-matches this index.
create unique index if not exists orders_user_idempotency_key_uidx
  on public.orders (user_id, checkout_idempotency_key)
  where checkout_idempotency_key is not null;

create index if not exists orders_user_created_at_idx
  on public.orders (user_id, created_at desc);

-- ===================================================
-- 3. The trusted order-creation boundary
-- ===================================================
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

comment on function public.create_order(text, jsonb, jsonb, text, text) is
  'Atomic, idempotent, permission-checked order creation. Derives the customer from auth.uid(), prices from product_variants and deducts stock in the same transaction.';

-- ===================================================
-- 4. Close the direct-write path
-- ===================================================
-- All INSERT policies on orders/order_items are removed by discovery so a
-- legacy or dashboard-authored policy cannot re-open the hole. service_role
-- bypasses RLS, so it keeps its existing INSERT grants and administrative
-- operations (cancellation/fulfilment RPCs) are SECURITY DEFINER and unaffected.
do $$
declare
  pol record;
  dropped int := 0;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('orders', 'order_items')
      and cmd = 'INSERT'
    order by tablename, policyname
  loop
    execute format('drop policy %I on public.%I', pol.policyname, pol.tablename);
    dropped := dropped + 1;
    raise notice '0016: dropped INSERT policy %.%', pol.tablename, pol.policyname;
  end loop;

  raise notice '0016: dropped % INSERT policy/policies on orders/order_items', dropped;
end $$;

revoke insert on public.orders from public;
revoke insert on public.order_items from public;
revoke insert on public.orders from anon, authenticated;
revoke insert on public.order_items from anon, authenticated;

-- ===================================================
-- 5. Execution privileges
-- ===================================================
revoke all on function public.create_order(text, jsonb, jsonb, text, text) from public;
revoke all on function public.create_order(text, jsonb, jsonb, text, text) from anon;
grant execute on function public.create_order(text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.create_order(text, jsonb, jsonb, text, text) to service_role;

-- ===================================================
-- 6. Self-verification — fail loudly instead of half-applying
-- ===================================================
do $$
declare
  is_secdef boolean;
  has_unique_order_number boolean;
  has_idempotency_index boolean;
  insert_policies int;
begin
  select prosecdef into is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_order';

  if is_secdef is null then
    raise exception 'Migration 0016 failed: public.create_order does not exist';
  end if;
  if not is_secdef then
    raise exception 'Migration 0016 failed: public.create_order is not SECURITY DEFINER';
  end if;

  select exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
    where n.nspname = 'public'
      and c.relname = 'orders'
      and i.indisunique
      and i.indpred is null
      and i.indexprs is null
      and i.indnkeyatts = 1
      and a.attname = 'order_number'
  ) into has_unique_order_number;

  if not has_unique_order_number then
    raise exception 'Migration 0016 failed: orders.order_number is not uniquely indexed';
  end if;

  select exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'orders'
      and indexname = 'orders_user_idempotency_key_uidx'
  ) into has_idempotency_index;

  if not has_idempotency_index then
    raise exception 'Migration 0016 failed: orders_user_idempotency_key_uidx is missing';
  end if;

  select count(*) into insert_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('orders', 'order_items')
    and cmd = 'INSERT';

  if insert_policies <> 0 then
    raise exception 'Migration 0016 failed: % INSERT policy/policies remain on orders/order_items', insert_policies;
  end if;

  if has_table_privilege('authenticated', 'public.orders', 'INSERT') then
    raise exception 'Migration 0016 failed: authenticated still has INSERT on orders';
  end if;

  if has_table_privilege('authenticated', 'public.order_items', 'INSERT') then
    raise exception 'Migration 0016 failed: authenticated still has INSERT on order_items';
  end if;

  if not has_table_privilege('service_role', 'public.orders', 'INSERT') then
    raise exception 'Migration 0016 failed: service_role lost INSERT on orders';
  end if;

  if not has_table_privilege('service_role', 'public.order_items', 'INSERT') then
    raise exception 'Migration 0016 failed: service_role lost INSERT on order_items';
  end if;

  if not has_function_privilege('authenticated', 'public.create_order(text, jsonb, jsonb, text, text)', 'EXECUTE') then
    raise exception 'Migration 0016 failed: authenticated cannot execute create_order';
  end if;

  if has_function_privilege('anon', 'public.create_order(text, jsonb, jsonb, text, text)', 'EXECUTE') then
    raise exception 'Migration 0016 failed: anon must not execute create_order';
  end if;

  raise notice '--- Solenne 0016 OK: atomic idempotent create_order installed; direct INSERT on orders/order_items revoked; order numbers uniquely indexed ---';
end $$;
