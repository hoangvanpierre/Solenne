-- ===================================================
-- Solenne — integration seed for 0016 create_order tests
-- ===================================================
-- Run AFTER migrations 0001–0008 (and before 0016 + the test file).
-- Inserts auth users (0001's trigger creates their profiles with the customer
-- role), then adjusts the roles/status the scenarios need, and seeds a small
-- catalog.
-- ===================================================

insert into auth.users (id, email, raw_user_meta_data) values
  ('a1111111-1111-4111-8111-111111111111', 'customer.a@example.test',
   '{"full_name":"Customer A"}'::jsonb),
  ('b2222222-2222-4222-8222-222222222222', 'customer.b@example.test',
   '{"full_name":"Customer B"}'::jsonb),
  ('c3333333-3333-4333-8333-333333333333', 'suspended@example.test',
   '{"full_name":"Suspended Customer"}'::jsonb),
  ('d4444444-4444-4444-8444-444444444444', 'staff@example.test',
   '{"full_name":"Staff Member"}'::jsonb),
  ('e5555555-5555-4555-8555-555555555555', 'manager@example.test',
   '{"full_name":"Manager"}'::jsonb)
on conflict (id) do nothing;

update public.profiles
set role_id = public.role_id_by_name('customer'), status = 'active'
where id in (
  'a1111111-1111-4111-8111-111111111111',
  'b2222222-2222-4222-8222-222222222222'
);

update public.profiles
set role_id = public.role_id_by_name('customer'), status = 'suspended'
where id = 'c3333333-3333-4333-8333-333333333333';

update public.profiles
set role_id = public.role_id_by_name('staff'), status = 'active'
where id = 'd4444444-4444-4444-8444-444444444444';

update public.profiles
set role_id = public.role_id_by_name('manager'), status = 'active'
where id = 'e5555555-5555-4555-8555-555555555555';

insert into public.products (id, slug, name, base_price, is_active) values
  ('10000000-0000-4000-8000-000000000001', 'midnight-garden', 'Midnight Garden', 48.00, true),
  ('10000000-0000-4000-8000-000000000002', 'retired-candle', 'Retired Candle', 30.00, false),
  ('10000000-0000-4000-8000-000000000003', 'low-stock', 'Low Stock Candle', 10.00, true),
  ('10000000-0000-4000-8000-000000000004', 'sale-candle', 'Sale Candle', 10.00, true)
on conflict (id) do nothing;

insert into public.product_variants
  (id, product_id, name, size, sku, price, stock_quantity)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '220g', '220g', 'MG-220', 48.00, 10),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '220g', '220g', 'RC-220', 30.00, 10),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003',
   '100g', '100g', 'LS-100', 10.00, 1),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004',
   '100g', '100g', 'SC-100', 10.00, 100)
on conflict (id) do nothing;
