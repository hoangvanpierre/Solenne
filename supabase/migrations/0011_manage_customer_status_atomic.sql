-- ===================================================
-- Solenne RBAC — 0011: Atomic Customer Account Status Management & Privilege Hardening
-- ===================================================
-- Apply after 0001–0010. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Column-Level Privilege Hardening:
--      In 0003_rbac_rls.sql, `authenticated` was granted broad UPDATE on `public.profiles`.
--      While `guard_profile_privileges()` and RLS provide defense-in-depth, least-privilege
--      database security requires revoking broad table UPDATE and granting UPDATE
--      only on safe self-service profile columns: (full_name, phone, avatar_url, updated_at).
--      Direct PostgREST calls can never directly mutate `status` or `role_id`.
--
--   2. Atomic Customer Account Status Management (Module B2):
--      Provides a trusted, atomic SECURITY DEFINER RPC `public.manage_customer_status`
--      for suspending, reactivating, and banning customer accounts.
--
--   3. Strict Security Invariants:
--      - Actor identity derived exclusively from `auth.uid()` (never client input).
--      - Internal permission check requiring `staff.manage` (held only by admin).
--      - Rejects self-status changes (an administrator cannot suspend or ban themselves).
--      - Target role isolation: operates strictly on profiles possessing the `customer` role.
--        Staff, managers, and administrators cannot be targeted through this interface.
--      - Row-level lock (`FOR UPDATE`) on the target customer profile to serialize concurrent transitions.
--      - Transition machine:
--          active    -> suspended (allowed, reason required 5-255 chars)
--          active    -> banned    (allowed, reason required 5-255 chars)
--          suspended -> active    (allowed, reason required 5-255 chars)
--          suspended -> banned    (allowed, reason required 5-255 chars)
--          banned    -> any       (rejected: banned is terminal in this module)
--          pending   -> any       (rejected: out of scope for this module)
--          x         -> x         (rejected as no-op)
--      - Atomic in-transaction audit logging: writes `customer.status_changed` to `public.audit_logs`.
--      - Sanitizes free-text reason input against inadvertent email/phone exposure.
-- ===================================================

-- ---------------------------------------------------------------------------
-- 1. Column-level privilege hardening on public.profiles
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url, updated_at) on public.profiles to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Atomic Customer Status Management RPC
-- ---------------------------------------------------------------------------
create or replace function public.manage_customer_status(
  p_customer_id uuid,
  p_target_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid;
  v_target_status text;
  v_reason text;
  v_sanitized_reason text;
  v_customer record;
  v_current_status text;
begin
  -- 1. Derive and verify authenticated caller from session context
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Verify staff.manage permission inside the trusted database boundary
  if not public.has_permission('staff.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 3. Validate target customer UUID and ensure caller is not modifying their own account
  if p_customer_id is null then
    raise exception 'INVALID_CUSTOMER_ID' using errcode = '22000';
  end if;

  if p_customer_id = v_actor_id then
    raise exception 'SELF_STATUS_CHANGE_FORBIDDEN' using errcode = '42501';
  end if;

  -- 4. Validate target status
  v_target_status := lower(trim(coalesce(p_target_status, '')));
  if v_target_status not in ('active', 'suspended', 'banned') then
    raise exception 'INVALID_TARGET_STATUS' using errcode = '22000';
  end if;

  -- 5. Validate and trim reason input (enforce 5-255 characters)
  v_reason := trim(coalesce(p_reason, ''));
  if length(v_reason) < 5 or length(v_reason) > 255 then
    raise exception 'INVALID_REASON' using errcode = '22000';
  end if;

  -- 6. Lock target customer profile row FOR UPDATE and resolve role
  select p.id, p.status, p.role_id, r.name as role_name
  into v_customer
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = p_customer_id
  for update of p;

  if v_customer.id is null then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 7. Role isolation: Target MUST have customer role
  if v_customer.role_name <> 'customer' then
    raise exception 'INVALID_TARGET_ROLE: Only customer profiles can be managed' using errcode = '42501';
  end if;

  -- 8. Status transition validations
  v_current_status := v_customer.status;

  -- Rejection: No-op transitions
  if v_current_status = v_target_status then
    raise exception 'NOOP_TRANSITION: Customer is already %', v_target_status using errcode = '22000';
  end if;

  -- Rejection: Banned status is terminal in Module B2
  if v_current_status = 'banned' then
    raise exception 'BANNED_STATUS_TERMINAL: Reversal of banned status is not supported' using errcode = '22000';
  end if;

  -- Rejection: Pending status cannot be transitioned through this interface
  if v_current_status = 'pending' then
    raise exception 'PENDING_STATUS_UNSUPPORTED: Pending accounts cannot be transitioned' using errcode = '22000';
  end if;

  -- Enforce allowed transitions:
  -- active    -> suspended
  -- active    -> banned
  -- suspended -> active
  -- suspended -> banned
  if not (
    (v_current_status = 'active' and v_target_status in ('suspended', 'banned')) or
    (v_current_status = 'suspended' and v_target_status in ('active', 'banned'))
  ) then
    raise exception 'INVALID_STATUS_TRANSITION: Cannot transition from % to %', v_current_status, v_target_status using errcode = '22000';
  end if;

  -- 9. Redact sensitive patterns (emails and phone numbers) in reason before audit storage
  v_sanitized_reason := regexp_replace(v_reason, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[REDACTED_EMAIL]', 'g');
  v_sanitized_reason := regexp_replace(v_sanitized_reason, '(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}', '[REDACTED_PHONE]', 'g');

  -- 10. Execute status update
  update public.profiles
  set status = v_target_status,
      updated_at = now()
  where id = p_customer_id;

  -- 11. Record audit event atomically within the same database transaction
  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_actor_id,
    'customer.status_changed',
    'profile',
    p_customer_id::text,
    jsonb_build_object(
      'old_status', v_current_status,
      'new_status', v_target_status,
      'reason', v_sanitized_reason
    )
  );

  -- 12. Return operational summary
  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'old_status', v_current_status,
    'new_status', v_target_status
  );
end;
$$;

comment on function public.manage_customer_status(uuid, text, text) is
  'Transitions customer account status (active <-> suspended, active/suspended -> banned) with atomic audit logging. Requires staff.manage permission.';

-- Revoke execute from public and anon
revoke all on function public.manage_customer_status(uuid, text, text) from public;
revoke all on function public.manage_customer_status(uuid, text, text) from anon;

-- Grant execute to authenticated and service_role
grant execute on function public.manage_customer_status(uuid, text, text) to authenticated;
grant execute on function public.manage_customer_status(uuid, text, text) to service_role;


-- ---------------------------------------------------------------------------
-- 3. Self-verification block
-- ---------------------------------------------------------------------------
do $$
declare
  is_secdef boolean;
  can_update_status boolean;
  can_update_name boolean;
begin
  -- 1. Verify manage_customer_status existence and SECURITY DEFINER setting
  select prosecdef into is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'manage_customer_status';

  if is_secdef is null then
    raise exception 'Migration 0011 failed: function public.manage_customer_status does not exist';
  end if;

  if not is_secdef then
    raise exception 'Migration 0011 failed: function public.manage_customer_status is not SECURITY DEFINER';
  end if;

  -- 2. Verify column-level privilege hardening on public.profiles
  select has_column_privilege('authenticated', 'public.profiles', 'status', 'update') into can_update_status;
  select has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update') into can_update_name;

  if can_update_status then
    raise exception 'Migration 0011 failed: authenticated role still has UPDATE privilege on public.profiles.status';
  end if;

  if not can_update_name then
    raise exception 'Migration 0011 failed: authenticated role lacks UPDATE privilege on public.profiles.full_name';
  end if;

  raise notice '--- RBAC 0011 OK: public.manage_customer_status created and profiles column privileges hardened ---';
end $$;
