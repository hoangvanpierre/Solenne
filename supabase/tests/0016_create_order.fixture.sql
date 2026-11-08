-- ===================================================
-- Solenne — integration fixture for 0016 create_order tests
-- ===================================================
-- Recreates the minimal pre-migration surface that the live database had:
-- auth schema/roles, the pre-existing storefront tables (profiles, products,
-- product_variants, orders, order_items, addresses), and the Supabase helper
-- function auth.uid().
--
-- This file is ONLY for a fresh, disposable database (local Postgres or a
-- throwaway test project). It refuses to touch a database that already has
-- orders, so it can never be run against production by accident.
--
-- Usage: see supabase/tests/README.md
-- ===================================================

do $$
begin
  if to_regclass('public.orders') is not null then
    if exists (select 1 from public.orders limit 1) then
      raise exception
        'Refusing to seed: public.orders already contains rows. Use a fresh disposable database only.';
    end if;
  end if;
end $$;

-- Supabase roles used by the migrations and grants.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin noinherit';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin noinherit';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin noinherit bypassrls';
  end if;
end $$;

create schema if not exists auth;

-- Supabase reads the JWT subject from the request context. The tests set
-- request.jwt.claim.sub with set_config(..., true) to impersonate a customer.
-- Create it only when absent so this fixture can never overwrite a real
-- Supabase auth.uid() on a local stack that already provides one.
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute format(
      'create function auth.uid() returns uuid language sql stable as %L',
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid'
    );
  end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Pre-existing profile table; migration 0001 adds role_id/status.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  category text,
  base_price numeric(10,2) not null default 0,
  is_active boolean not null default true,
  images text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  size text,
  sku text unique,
  price numeric(10,2) not null,
  stock_quantity integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  order_number text not null,
  status text not null default 'pending',
  subtotal numeric(10,2) not null,
  shipping_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  stripe_session_id text,
  stripe_payment_intent text,
  shipping_address jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  variant_id uuid references public.product_variants(id),
  product_name text not null,
  variant_name text,
  quantity integer not null,
  unit_price numeric(10,2) not null,
  total_price numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  line1 text not null,
  line2 text,
  city text not null,
  state text,
  postal_code text not null,
  country text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The migration chain grants to these roles explicitly; catalog reads stay
-- public exactly like the live storefront.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.products, public.product_variants to anon, authenticated;