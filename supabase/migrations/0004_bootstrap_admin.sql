-- ===================================================
-- Solenne RBAC — 0004: bootstrap the initial administrator
-- ===================================================
-- This file is INTENTIONALLY inert. It promotes nobody until an operator names
-- an account explicitly:
--   * the first user is NOT automatically an admin
--   * no email is hard-coded anywhere in this repository
--   * there is no `if (email === "admin@...")` pattern in application code
--   * running 0001-0003 grants no administrative role to anybody
--
-- HOW TO USE
--   1. List the accounts and pick the owner deliberately:
--        select id, email, created_at from auth.users order by created_at;
--   2. Set v_email below (and optionally v_reason).
--   3. Run ONLY this file.
--   4. Re-run it unchanged (v_email stays null) to confirm it does nothing.
--
-- The promotion is written to audit_logs. `actor_id` is null on purpose: this is
-- an out-of-band operator action with no authenticated actor, and the metadata
-- records the provenance. Do NOT commit this file with v_email filled in.

do $$
declare
  -- >>>>>>>>>>>>>>>>>> EDIT THIS LINE <<<<<<<<<<<<<<<<<<
  v_email  text := 'dangvohoangvan@gmail.com';   -- e.g. 'owner@example.com'
  v_reason text := 'Initial administrator bootstrap';

  v_target   uuid;
  v_admin_id uuid;
  v_old_role text;
begin
  if v_email is null then
    raise notice 'RBAC 0004: v_email is null - nothing to do. Edit this file to name the initial administrator.';
    return;
  end if;

  select id into v_target from auth.users where lower(email) = lower(v_email);
  if v_target is null then
    raise exception 'RBAC 0004: no auth.users row matches %', v_email;
  end if;

  v_admin_id := public.role_id_by_name('admin');
  if v_admin_id is null then
    raise exception 'RBAC 0004: role "admin" is missing. Apply 0002_rbac_seed.sql first.';
  end if;

  select r.name into v_old_role
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = v_target;

  -- Normally the signup trigger already created the profile; this only covers
  -- accounts that predate 0001.
  insert into public.profiles (id, role_id, status)
  values (v_target, v_admin_id, 'active')
  on conflict (id) do nothing;

  update public.profiles
  set role_id = v_admin_id,
      status = 'active',
      updated_at = now()
  where id = v_target;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata)
  values (
    null,
    'user.role_changed',
    'profile',
    v_target::text,
    jsonb_build_object(
      'via', '0004_bootstrap_admin.sql',
      'reason', v_reason,
      'from', coalesce(v_old_role, '(none)'),
      'to', 'admin'
    )
  );

  raise notice 'RBAC 0004: % promoted to admin (was %).', v_email, coalesce(v_old_role, '(none)');
end $$;

-- Post-bootstrap report: how many active administrators exist now.
select
  (select count(*) from public.profiles p
     join public.roles r on r.id = p.role_id
    where r.name = 'admin' and p.status = 'active') as active_admins,
  (select count(*) from public.profiles) as total_profiles;
