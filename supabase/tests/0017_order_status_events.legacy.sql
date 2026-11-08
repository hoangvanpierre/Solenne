-- ===================================================
-- Solenne — Phase 2 integration fixture: one legacy order
-- ===================================================
-- Run AFTER 0016 and BEFORE 0017. It simulates an order that existed before
-- order_status_events was introduced, so the backfill can be verified against
-- real pre-migration data. It deliberately has no order_items and no
-- status events.
-- ===================================================

insert into public.orders (
  id,
  user_id,
  order_number,
  status,
  subtotal,
  shipping_fee,
  discount,
  total,
  shipping_address,
  notes,
  created_at,
  updated_at,
  tracking_code
)
values (
  '30000000-0000-4000-8000-000000000001',
  'a1111111-1111-4111-8111-111111111111',
  'LEGACY-001',
  'processing',
  25.00,
  0.00,
  0.00,
  25.00,
  '{"fullName":"Customer A","phone":"0901234567","line1":"1 Old Road","city":"Ho Chi Minh City","postalCode":"700000","country":"Vietnam"}'::jsonb,
  'Legacy order created before status history',
  now() - interval '10 days',
  now() - interval '2 days',
  'TRACK-LEGACY-001'
)
on conflict (id) do nothing;
