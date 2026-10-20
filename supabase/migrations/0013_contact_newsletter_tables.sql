-- ===================================================
-- Solenne — 0013: Contact Messages & Newsletter Subscribers
-- ===================================================
-- Apply after 0001–0012. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Missing Persistence Surface:
--      The contact form (app/actions/contact.ts) and the newsletter signup
--      (app/actions/newsletter.ts) both insert through the secret-key admin
--      client into `public.contact_messages` and `public.newsletter_subscribers`.
--      Neither relation existed in the live project, so every submission was
--      silently dropped while the UI still reported success.
--
--   2. Least-Privilege Write Surface:
--      Both tables are written exclusively by the server through the admin
--      (service_role) client. There is no client-side write path, so no
--      `anon` or `authenticated` INSERT policy is created. Public write grants
--      would let any visitor (or any script holding the publishable key)
--      inject rows directly into the contact and newsletter tables.
--
--   3. Read Restriction:
--      Subscribed addresses and contact inquiries are private data. Only
--      `service_role` may read either table, so neither relation is exposed
--      through the public PostgREST schema.
--
--   4. RLS Enabled:
--      Row level security is switched on for both tables so that any future
--      policy added by a later migration is additive rather than accidental.
--      With no permissive policy in place and no grant to `anon` /
--      `authenticated`, the tables are unreachable from the public API.
--
--   5. Idempotency:
--      `create table if not exists` means the file can be re-run safely
--      against a database where the tables already exist.
-- ===================================================

-- ---------------------------------------------------------------------------
-- 1. Contact Messages
-- ---------------------------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  subject text,
  message text not null,
  created_at timestamptz not null default now()
);

comment on table public.contact_messages is
  'Inbound contact-form submissions. Written only by the server admin client.';

alter table public.contact_messages enable row level security;

-- No permissive policy is created: the only writer is the service_role admin
-- client, which bypasses RLS as the table owner.

-- ---------------------------------------------------------------------------
-- 2. Newsletter Subscribers
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  subscribed_at timestamptz not null default now()
);

comment on table public.newsletter_subscribers is
  'Newsletter subscribers. Written only by the server admin client.';

alter table public.newsletter_subscribers enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Grants — service_role only (least privilege)
-- ---------------------------------------------------------------------------
revoke all on table public.contact_messages from anon, authenticated;
revoke all on table public.contact_messages from public;

revoke all on table public.newsletter_subscribers from anon, authenticated;
revoke all on table public.newsletter_subscribers from public;

grant select, insert on public.contact_messages to service_role;
grant select, insert on public.newsletter_subscribers to service_role;

-- ---------------------------------------------------------------------------
-- 4. Self-verification block
-- ---------------------------------------------------------------------------
do $$
declare
  contact_exists boolean;
  newsletter_exists boolean;
  contact_rls boolean;
  newsletter_rls boolean;
  contact_anon_insert boolean;
  contact_anon_select boolean;
  newsletter_anon_insert boolean;
  newsletter_anon_select boolean;
  contact_service_insert boolean;
  newsletter_service_insert boolean;
  newsletter_unique_email boolean;
begin
  -- 1. Both relations exist
  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'contact_messages' and c.relkind = 'r'
  ) into contact_exists;

  if not contact_exists then
    raise exception 'Migration 0013 failed: table public.contact_messages does not exist';
  end if;

  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'newsletter_subscribers' and c.relkind = 'r'
  ) into newsletter_exists;

  if not newsletter_exists then
    raise exception 'Migration 0013 failed: table public.newsletter_subscribers does not exist';
  end if;

  -- 2. RLS is enabled on both tables
  select relrowsecurity into contact_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'contact_messages';

  if not contact_rls then
    raise exception 'Migration 0013 failed: row level security is not enabled on public.contact_messages';
  end if;

  select relrowsecurity into newsletter_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'newsletter_subscribers';

  if not newsletter_rls then
    raise exception 'Migration 0013 failed: row level security is not enabled on public.newsletter_subscribers';
  end if;

  -- 3. anon holds no INSERT and no SELECT on either table
  select has_table_privilege('anon', 'public.contact_messages', 'insert') into contact_anon_insert;
  if contact_anon_insert then
    raise exception 'Migration 0013 failed: anon unexpectedly holds INSERT on public.contact_messages';
  end if;

  select has_table_privilege('anon', 'public.contact_messages', 'select') into contact_anon_select;
  if contact_anon_select then
    raise exception 'Migration 0013 failed: anon unexpectedly holds SELECT on public.contact_messages';
  end if;

  select has_table_privilege('anon', 'public.newsletter_subscribers', 'insert') into newsletter_anon_insert;
  if newsletter_anon_insert then
    raise exception 'Migration 0013 failed: anon unexpectedly holds INSERT on public.newsletter_subscribers';
  end if;

  select has_table_privilege('anon', 'public.newsletter_subscribers', 'select') into newsletter_anon_select;
  if newsletter_anon_select then
    raise exception 'Migration 0013 failed: anon unexpectedly holds SELECT on public.newsletter_subscribers';
  end if;

  -- 4. service_role holds INSERT on both tables
  select has_table_privilege('service_role', 'public.contact_messages', 'insert') into contact_service_insert;
  if not contact_service_insert then
    raise exception 'Migration 0013 failed: service_role lacks INSERT on public.contact_messages';
  end if;

  select has_table_privilege('service_role', 'public.newsletter_subscribers', 'insert') into newsletter_service_insert;
  if not newsletter_service_insert then
    raise exception 'Migration 0013 failed: service_role lacks INSERT on public.newsletter_subscribers';
  end if;

  -- 5. newsletter_subscribers.email is unique (drives the 23505 duplicate branch)
  select exists (
    select 1 from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'newsletter_subscribers'
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) ilike '%(email)%'
  ) into newsletter_unique_email;

  if not newsletter_unique_email then
    raise exception 'Migration 0013 failed: public.newsletter_subscribers.email is not uniquely indexed';
  end if;

  raise notice '--- Solenne 0013 OK: contact_messages and newsletter_subscribers created, RLS enabled, service_role-only writes ---';
end $$;
