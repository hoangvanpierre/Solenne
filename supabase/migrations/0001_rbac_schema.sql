-- ===================================================
-- Solenne RBAC — 0001: schema, helper functions, triggers
-- ===================================================
-- Apply: Supabase Dashboard -> SQL Editor -> paste -> Run.
-- Order: 0001 -> 0002 (seed) -> 0003 (RLS + grants) -> 0004 (bootstrap admin).
--
-- NON-DESTRUCTIVE: this migration only CREATES tables/columns/functions and
-- ALTERs `profiles` to add two nullable columns. No column is dropped, no row is
-- deleted, no existing policy is removed, and Supabase Auth is untouched.
--
-- OWNERSHIP NOTE (important): every helper below is SECURITY DEFINER. Apply this
-- migration as the project owner (the SQL Editor's `postgres` role). Postgres
-- bypasses RLS for a table's owner, which is what stops a policy on `profiles`
-- that calls public.has_permission() from recursing into `profiles`. If these
-- functions end up owned by a lesser role the policies will error out.

-- ---------- roles ----------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  -- Stable authorization identifier (customer|staff|manager|admin).
  -- Never a display name, never a locale-specific label.
  name text not null unique
    check (name = lower(name) and name ~ '^[a-z][a-z0-9_]*$'),
  description text,
  -- Hierarchy for "staff or above" checks, so adding a new role later does not
  -- mean rewriting every authorization rule.
  rank int not null default 0,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.roles is
  'RBAC roles. `name` is the stable identifier used by all authorization logic.';

-- ---------- permissions ----------
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  -- Namespaced action key, e.g. product.update. Explicit only: no wildcards,
  -- because wildcards cannot be expressed cleanly in RLS predicates.
  key text not null unique
    check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  description text,
  created_at timestamptz not null default now()
);

comment on table public.permissions is
  'Explicit permission catalogue. Permissions are granted to roles, never to users directly.';

-- ---------- role_permissions ----------
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- A permission cannot be granted twice to the same role.
  primary key (role_id, permission_id)
);

create index if not exists role_permissions_permission_idx
  on public.role_permissions (permission_id);

-- ---------- audit_logs ----------
-- Append-only by construction: no UPDATE/DELETE policy is ever created, and the
-- privileges are revoked in 0003. `actor_id` deliberately has NO foreign key, so
-- audit records survive account deletion and cannot block it.
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_action_idx on public.audit_logs (action);
create index if not exists audit_logs_resource_idx
  on public.audit_logs (resource_type, resource_id);

comment on table public.audit_logs is
  'Append-only security audit trail. Reading requires audit.read; nobody may update or delete.';

-- ===================================================
-- profiles: additive columns only (nullable here; 0002 backfills and locks down)
-- ===================================================
alter table public.profiles
  add column if not exists status text not null default 'active';

alter table public.profiles
  add column if not exists role_id uuid references public.roles(id) on delete restrict;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'suspended', 'banned', 'pending'));
  end if;
end $$;

create index if not exists profiles_role_id_idx on public.profiles (role_id);
create index if not exists profiles_status_idx on public.profiles (status);

-- ===================================================
-- Helper functions — the only place authorization primitives live
-- ===================================================
-- All are SECURITY DEFINER with a pinned search_path so that (a) policies can
-- call them without recursing into RLS, and (b) a caller cannot hijack them by
-- shadowing a schema on their own search_path.

create or replace function public.role_id_by_name(p_name text)
returns uuid language sql stable
set search_path = public, pg_temp as $$
  select id from public.roles where name = p_name;
$$;

-- Default role for every new account. Raises loudly if the seed has not run,
-- rather than silently creating role-less (locked-out) profiles.
create or replace function public.default_role_id()
returns uuid language plpgsql stable
set search_path = public, pg_temp as $$
declare
  v uuid;
begin
  select id into v from public.roles where name = 'customer';
  if v is null then
    raise exception 'RBAC not seeded: role "customer" is missing. Apply 0002_rbac_seed.sql first.';
  end if;
  return v;
end $$;

-- Which Postgres/JWT role is issuing the statement: anon | authenticated |
-- service_role | postgres. Used to let the server-only secret key through the
-- guard triggers (it performs its own explicit permission check + audit).
create or replace function public.requesting_role()
returns text language sql stable
set search_path = public, pg_temp as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    current_user
  );
$$;

-- Identity is ALWAYS derived from the verified session (auth.uid()) plus trusted
-- database rows. Never from headers, body, query string or client storage.
create or replace function public.is_active_account()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.status = 'active'
  );
$$;

create or replace function public.current_role_name()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select r.name
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

create or replace function public.current_role_rank()
returns int language sql stable security definer
set search_path = public, pg_temp as $$
  select r.rank
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

-- The single permission predicate.
-- Suspended/banned/pending accounts hold NO permissions, even with a valid role:
-- that is what makes account status enforcement uniform across every layer.
create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_id = p.role_id
    join public.permissions pm on pm.id = rp.permission_id
    where p.id = auth.uid()
      and p.status = 'active'
      and pm.key = p_key
  );
$$;

create or replace function public.has_role(p_name text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.status = 'active' and r.name = p_name
  );
$$;

create or replace function public.has_min_role_rank(p_rank int)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid() and p.status = 'active' and r.rank >= p_rank
  );
$$;

-- Used by the last-admin lockout guard.
create or replace function public.count_active_admins()
returns int language sql stable security definer
set search_path = public, pg_temp as $$
  select count(*)::int
  from public.profiles p
  where p.role_id = public.role_id_by_name('admin') and p.status = 'active';
$$;

-- ===================================================
-- Actor descriptor RPC — one round trip for the server authorization layer
-- ===================================================
-- Returns null when unauthenticated or when no profile exists. Permissions are
-- emptied for any non-active status, so a suspended account is degranted
-- everywhere at once.
create or replace function public.current_actor()
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'user_id', p.id,
    'role', r.name,
    'role_rank', r.rank,
    'status', p.status,
    'full_name', p.full_name,
    'permissions', case
      when p.status = 'active' then coalesce((
        select jsonb_agg(pm.key order by pm.key)
        from public.role_permissions rp
        join public.permissions pm on pm.id = rp.permission_id
        where rp.role_id = p.role_id
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  )
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;

grant execute on function public.current_actor() to authenticated;

-- ===================================================
-- Trigger: new auth user -> profile with the customer role
-- ===================================================
-- The role is chosen by the DATABASE, never by the client. A registration
-- payload containing {"role":"admin"} has no effect: signUp() only writes
-- raw_user_meta_data, which this function ignores for authorization purposes.
--
-- CREATE OR REPLACE keeps any pre-existing profile-provisioning behaviour while
-- adding `role_id`/`status`; `on conflict do nothing` means a second, differently
-- named trigger elsewhere cannot cause a duplicate-key failure.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name, avatar_url, role_id, status)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    public.default_role_id(),
    'active'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================================================
-- Triggers: privilege-escalation + last-admin lockout guards
-- ===================================================
-- Triggers fire even for the service role, so this is real defence in depth
-- rather than a UI convention. The trusted server path is exempted because it
-- performs an explicit permission check and writes an audit record first.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  actor uuid := auth.uid();
  trusted boolean := public.requesting_role() in ('service_role', 'postgres', 'supabase_admin');
  admin_id uuid := public.role_id_by_name('admin');
begin
  if trusted then
    return new;
  end if;

  -- Role changes require role.manage, and never on your own row.
  if new.role_id is distinct from old.role_id then
    if actor is null or not public.has_permission('role.manage') then
      raise exception 'Insufficient privileges to change a role' using errcode = '42501';
    end if;
    if actor = old.id then
      raise exception 'You cannot change your own role' using errcode = '42501';
    end if;
  end if;

  -- Status changes require staff.manage, and never on your own row.
  if new.status is distinct from old.status then
    if actor is null or not public.has_permission('staff.manage') then
      raise exception 'Insufficient privileges to change account status' using errcode = '42501';
    end if;
    if actor = old.id then
      raise exception 'You cannot change your own account status' using errcode = '42501';
    end if;
  end if;

  -- Last-admin lockout: never let the final active admin be demoted or disabled.
  if old.role_id = admin_id
     and old.status = 'active'
     and (new.role_id is distinct from admin_id or new.status <> 'active')
     and public.count_active_admins() <= 1 then
    raise exception 'Cannot demote or deactivate the last active administrator' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

