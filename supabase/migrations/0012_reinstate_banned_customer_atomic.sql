-- ===================================================
-- Solenne RBAC — 0012: Atomic Controlled Reinstatement of Banned Customers
-- ===================================================
-- Apply after 0001–0011. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Preservation of the Terminal-Ban Invariant:
--      In 0011_manage_customer_status_atomic.sql, `banned` status was intentionally
--      made terminal within `manage_customer_status`. Reversing a ban is an exceptional,
--      high-gravity administrative intervention that must never be permitted through
--      the ordinary status-management state machine.
--
--   2. Dedicated Atomic Reinstatement RPC:
--      Provides a dedicated, hardened SECURITY DEFINER RPC `public.reinstate_banned_customer`
--      to allow authorized administrators to reinstate a banned customer account to `active`
--      with mandatory non-empty reason validation and atomic in-transaction audit logging.
--
--   3. Strict Security Invariants:
--      - Hardened execution context: SET search_path = '' to completely prevent
--        search-path shadowing attacks and untrusted object substitution. All
--        relations and external functions are explicitly schema-qualified.
--      - Actor identity derived exclusively from `auth.uid()` (never caller-supplied).
--      - Internal permission check requiring `staff.manage` (held only by role admin).
--      - Caller account must be active (enforced via `has_permission`).
--      - Rejects self-reinstatement (an administrator cannot reinstate their own profile).
--      - Target role isolation: operates strictly on profiles possessing the `customer` role.
--      - Row-level lock (`FOR UPDATE`) on the target customer profile.
--      - State machine precondition: target must currently be in `banned` status.
--        Active, suspended, or pending accounts are strictly rejected.
--      - Requires a trimmed reason of 5–255 characters.
--      - Sanitizes free-text reason input against inadvertent email/phone exposure.
--      - Updates status to `active` and `updated_at` to `now()`.
--      - Atomic in-transaction audit logging: writes `customer.reinstated` to `public.audit_logs`.
--        Audit insertion failures abort and roll back the status update.
--      - Least-privilege execute grants: revoked from public, anon, and service_role.
--        Granted exclusively to authenticated for user-scoped client invocation.
-- ===================================================

-- ---------------------------------------------------------------------------
-- 1. Atomic Customer Reinstatement RPC
-- ---------------------------------------------------------------------------
create or replace function public.reinstate_banned_customer(
  p_customer_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_reason text;
  v_sanitized_reason text;
  v_customer record;
begin
  -- 1. Derive and verify authenticated caller from session context
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  -- 2. Verify staff.manage permission inside the trusted database boundary
  -- public.has_permission also asserts that the caller's profile is active.
  if not public.has_permission('staff.manage') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- 3. Validate target customer UUID and ensure caller is not modifying their own account
  if p_customer_id is null then
    raise exception 'INVALID_CUSTOMER_ID' using errcode = '22000';
  end if;

  if p_customer_id = v_actor_id then
    raise exception 'SELF_REINSTATEMENT_FORBIDDEN' using errcode = '42501';
  end if;

  -- 4. Validate and trim reason input (enforce 5-255 characters)
  if p_reason is null then
    raise exception 'INVALID_REASON' using errcode = '22000';
  end if;

  v_reason := pg_catalog.btrim(p_reason);
  if pg_catalog.length(v_reason) < 5 or pg_catalog.length(v_reason) > 255 then
    raise exception 'INVALID_REASON' using errcode = '22000';
  end if;

  -- 5. Lock target customer profile row FOR UPDATE and resolve role
  select p.id, p.status, p.role_id, r.name as role_name
  into v_customer
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = p_customer_id
  for update of p;

  if v_customer.id is null then
    raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- 6. Role isolation: Target MUST have customer role
  if v_customer.role_name <> 'customer' then
    raise exception 'INVALID_TARGET_ROLE: Only customer profiles can be reinstated' using errcode = '42501';
  end if;

  -- 7. State invariant: Target MUST currently be banned
  if v_customer.status <> 'banned' then
    raise exception 'CUSTOMER_NOT_BANNED: Only banned customer accounts can be reinstated' using errcode = '22000';
  end if;

  -- 8. Redact sensitive patterns (emails and phone numbers) in reason before audit storage
  v_sanitized_reason := pg_catalog.regexp_replace(v_reason, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[REDACTED_EMAIL]', 'g');
  v_sanitized_reason := pg_catalog.regexp_replace(v_sanitized_reason, '(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}', '[REDACTED_PHONE]', 'g');

  -- 9. Execute status update to active
  update public.profiles
  set status = 'active',
      updated_at = pg_catalog.now()
  where id = p_customer_id;

  -- 10. Record dedicated audit event atomically within the same database transaction
  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    v_actor_id,
    'customer.reinstated',
    'profile',
    p_customer_id::text,
    pg_catalog.jsonb_build_object(
      'old_status', 'banned',
      'new_status', 'active',
      'reason', v_sanitized_reason
    )
  );

  -- 11. Return operational summary
  return pg_catalog.jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'old_status', 'banned',
    'new_status', 'active'
  );
end;
$$;

comment on function public.reinstate_banned_customer(uuid, text) is
  'Reinstates a banned customer account to active status with atomic audit logging. Requires staff.manage permission.';

-- Revoke execute from public and anon
revoke all on function public.reinstate_banned_customer(uuid, text) from public;
revoke all on function public.reinstate_banned_customer(uuid, text) from anon;

-- Explicitly revoke execute from service_role (least-privilege hardening)
revoke all on function public.reinstate_banned_customer(uuid, text) from service_role;

-- Grant execute exclusively to authenticated (user-scoped client requires this)
grant execute on function public.reinstate_banned_customer(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 2. Self-verification block
-- ---------------------------------------------------------------------------
do $$
declare
  is_secdef boolean;
  is_hardened_search_path boolean;
  has_service_role_execute boolean;
  has_authenticated_execute boolean;
begin
  -- 1. Verify reinstate_banned_customer existence and SECURITY DEFINER setting
  select prosecdef into is_secdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reinstate_banned_customer';

  if is_secdef is null then
    raise exception 'Migration 0012 failed: function public.reinstate_banned_customer does not exist';
  end if;

  if not is_secdef then
    raise exception 'Migration 0012 failed: function public.reinstate_banned_customer is not SECURITY DEFINER';
  end if;

  -- 2. Verify search_path is hardened to empty string ('')
  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reinstate_banned_customer'
      and exists (
        select 1
        from unnest(p.proconfig) as cfg
        where cfg = 'search_path=' or cfg = 'search_path=""' or cfg = 'search_path='''''
      )
  ) into is_hardened_search_path;

  if not is_hardened_search_path then
    raise exception 'Migration 0012 failed: search_path is not hardened to empty string';
  end if;

  -- 3. Verify service_role does NOT hold execute privilege
  select has_function_privilege('service_role', 'public.reinstate_banned_customer(uuid, text)', 'execute')
  into has_service_role_execute;

  if has_service_role_execute then
    raise exception 'Migration 0012 failed: service_role unexpectedly holds EXECUTE privilege on public.reinstate_banned_customer';
  end if;

  -- 4. Verify authenticated holds execute privilege
  select has_function_privilege('authenticated', 'public.reinstate_banned_customer(uuid, text)', 'execute')
  into has_authenticated_execute;

  if not has_authenticated_execute then
    raise exception 'Migration 0012 failed: authenticated lacks EXECUTE privilege on public.reinstate_banned_customer';
  end if;

  -- 5. Verify no invalid pseudo-catalog expressions exist in function body
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'reinstate_banned_customer'
      and (p.prosrc ilike '%pg_catalog.coalesce%' or p.prosrc ilike '%pg_catalog.trim%')
  ) then
    raise exception 'Migration 0012 failed: invalid pseudo-catalog function call in function body';
  end if;

  raise notice '--- RBAC 0012 OK: public.reinstate_banned_customer created and hardened successfully ---';
end $$;
