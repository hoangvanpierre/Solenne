-- ===================================================
-- Solenne — 0015: Verified Customer Reviews & Post-Publication Reports
-- ===================================================
-- Apply after 0001–0014. Idempotent and transaction-safe.
--
-- Why this migration exists:
--   1. Immediate, verified publication.
--      A review exists only when the database can prove that the author owns a
--      DELIVERED order containing that product. There is no approval state:
--      a valid review is published the moment it is inserted and contributes to
--      the product rating immediately, regardless of its star count.
--
--   2. Verification is structural, not a client flag.
--      There is deliberately NO client-writable `verified_purchase` boolean.
--      Every row in public.product_reviews is verified by construction:
--        * the INSERT policy requires a delivered order item owned by the
--          caller for the reviewed product, and
--        * the guard trigger re-checks the same evidence and stores the
--          qualifying order_item_id itself, overwriting anything supplied.
--      A forged payload cannot claim a purchase, because the values that prove
--      it are derived inside the transaction from trusted tables.
--
--   3. One review per customer per product.
--      UNIQUE (user_id, product_id) means repeat purchases can only EDIT the
--      existing review. Buying again never creates a second rating.
--
--   4. Privacy-safe public surface.
--      The author's display name is a snapshot derived by the trigger from
--      profiles.full_name — never accepted from the client. Public queries can
--      never read user_id, order_item_id, hidden_by/hidden_at, or any profile
--      column: `anon` holds SELECT only on the publishable columns listed
--      below, and RLS restricts it to `status = 'published'`.
--
--   5. Two-state visibility.
--      'published'  -> publicly visible, counted in ratings.
--      'hidden'     -> withheld after a substantiated policy violation.
--      There is no pending/approval state, no queue, and no pre-publication
--      moderation anywhere in this feature.
--
--   6. Post-publication reports.
--      Customers may report a published review once (UNIQUE review_id +
--      reporter_id). A report NEVER hides anything by itself: hiding is a
--      separate, audited manager/admin action that requires a reason. Reports
--      are never readable by other customers.
--
--   7. Column authority.
--      RLS cannot express "these columns only" (see the note in 0003), so the
--      UPDATE shape is enforced by public.product_reviews_guard(), the same
--      pattern 0001 uses for profiles.role_id/status. Authors may change only
--      rating/title/body; managers may change only visibility. INSERT uses
--      column-level grants so a client cannot mass-assign status, display_name,
--      verification evidence or administrative fields at all.
--
--   8. Least privilege.
--      `anon`             -> SELECT on publishable columns of published rows.
--      `authenticated`    -> own reviews (including hidden), published reviews,
--                            INSERT of the five author-supplied fields, UPDATE
--                            constrained by policy + trigger.
--      `service_role`     -> maintenance path.
--      No `grant all`, no DELETE policy, no TRUNCATE.
--
--   9. Review history is preserved.
--      product_id is ON DELETE RESTRICT: a product with reviews cannot be
--      hard-deleted, so review history can never disappear silently. (The
--      existing admin delete path already refuses products referenced by
--      order_items, and a review requires such an order item, so this does not
--      change practical behaviour.) user_id cascades so deleting an account
--      removes that author's own reviews rather than leaving orphaned rows.
--
-- Apply this migration with the Supabase SQL editor as the project owner.
-- Do NOT re-run 0002 after this file: 0002 rebuilds the role→permission matrix
-- from scratch and would drop the review.manage_reports grant added here.
-- ===================================================

-- ---------------------------------------------------------------------------
-- 0. Dependency check — policies and the trigger call helpers from 0001
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_active_account'
  ) then
    raise exception 'Migration 0015 requires public.is_active_account() from migration 0001';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'has_permission'
  ) then
    raise exception 'Migration 0015 requires public.has_permission() from migration 0001';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'requesting_role'
  ) then
    raise exception 'Migration 0015 requires public.requesting_role() from migration 0001';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products(id) on delete restrict on update cascade,
  user_id uuid not null
    references public.profiles(id) on delete cascade on update cascade,
  -- Qualifying purchase evidence: the delivered order item this review is
  -- based on. Derived and validated by the trigger; never client-supplied.
  order_item_id uuid
    references public.order_items(id) on delete set null on update cascade,
  rating smallint not null,
  title text not null,
  body text not null,
  -- Privacy-safe public name, derived from profiles.full_name on write.
  display_name text,
  status text not null default 'published',
  hidden_reason text,
  -- No FK on purpose, mirroring audit_logs.actor_id: the moderation trail must
  -- survive account deletion.
  hidden_by uuid,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_reviews_user_product_key unique (user_id, product_id),
  constraint product_reviews_rating_check check (rating between 1 and 5),
  constraint product_reviews_title_check
    check (char_length(btrim(title)) between 3 and 120),
  constraint product_reviews_body_check
    check (char_length(btrim(body)) between 10 and 4000),
  constraint product_reviews_display_name_check
    check (display_name is null or char_length(display_name) <= 60),
  constraint product_reviews_status_check
    check (status in ('published', 'hidden')),
  constraint product_reviews_hidden_reason_check
    check (
      status <> 'hidden'
      or char_length(btrim(coalesce(hidden_reason, ''))) >= 3
    )
);

comment on table public.product_reviews is
  'Verified product reviews. Every row requires a delivered order item owned by the author; publication is immediate.';
comment on column public.product_reviews.user_id is
  'Author. Always auth.uid() at insert time; never accepted from client input.';
comment on column public.product_reviews.order_item_id is
  'Purchase evidence derived by product_reviews_guard(). Never client-supplied.';
comment on column public.product_reviews.display_name is
  'Privacy-safe public name snapshotted from profiles.full_name by the trigger.';
comment on column public.product_reviews.status is
  'published (public, counted in ratings) or hidden (withheld after a substantiated violation). No approval state exists.';

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null
    references public.product_reviews(id) on delete cascade on update cascade,
  reporter_id uuid not null
    references public.profiles(id) on delete cascade on update cascade,
  reason text not null,
  details text,
  status text not null default 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_reports_review_reporter_key unique (review_id, reporter_id),
  constraint review_reports_reason_check
    check (reason in (
      'spam',
      'abuse',
      'harassment',
      'personal_information',
      'irrelevant',
      'other'
    )),
  constraint review_reports_details_check
    check (details is null or char_length(details) <= 1000),
  constraint review_reports_status_check
    check (status in ('open', 'resolved', 'dismissed')),
  constraint review_reports_resolution_note_check
    check (resolution_note is null or char_length(resolution_note) <= 500)
);

comment on table public.review_reports is
  'Post-publication reports about a review. A report never hides a review by itself.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------
-- One index serves both the public listing (ordered by created_at) and the
-- rating aggregation (rating is an INCLUDE column, so the stats view can run
-- index-only). No second rating index is created.
create index if not exists product_reviews_product_status_created_idx
  on public.product_reviews (product_id, status, created_at desc)
  include (rating);

-- Serves the moderation queue (open reports newest first).
create index if not exists review_reports_status_created_idx
  on public.review_reports (status, created_at desc);

-- Serves the reporter cascade and a customer's own-report lookups.
create index if not exists review_reports_reporter_idx
  on public.review_reports (reporter_id);

-- ---------------------------------------------------------------------------
-- 3. Guard: derive verification + display name, enforce column authority
-- ---------------------------------------------------------------------------
create or replace function public.product_reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
  v_order_item_id uuid;
begin
  -- Maintenance path. service_role already bypasses RLS, so it can write
  -- anything anyway; the guard exists to constrain customer and manager
  -- requests, not to block data repair. Mirrors the trusted-role escape in
  -- 0001's profile guard.
  if public.requesting_role() in ('service_role', 'postgres', 'supabase_admin') then
    new.updated_at := now();
    if tg_op = 'INSERT' then
      new.id := coalesce(new.id, gen_random_uuid());
      new.created_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The public name always comes from the profile, never from the payload.
    select nullif(btrim(p.full_name), '')
      into v_display_name
      from public.profiles p
     where p.id = new.user_id;

    -- The database proves the purchase; the caller cannot assert it.
    select oi.id
      into v_order_item_id
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.product_id = new.product_id
       and o.user_id = new.user_id
       and o.status = 'delivered'
     order by o.created_at desc, oi.created_at desc, oi.id desc
     limit 1;

    if v_order_item_id is null then
      raise exception 'REVIEW_ELIGIBILITY_REQUIRED'
        using hint = 'A review requires a delivered order item for this product and customer.';
    end if;

    new.id := coalesce(new.id, gen_random_uuid());
    new.order_item_id := v_order_item_id;
    new.display_name := left(v_display_name, 60);
    new.status := 'published';
    new.hidden_reason := null;
    new.hidden_by := null;
    new.hidden_at := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE: identity, evidence and the public name are immutable for everyone.
  new.id := old.id;
  new.product_id := old.product_id;
  new.user_id := old.user_id;
  new.order_item_id := old.order_item_id;
  new.display_name := old.display_name;
  new.created_at := old.created_at;
  new.updated_at := now();

  -- Author path: content only, and only while the review is published.
  if auth.uid() is not null and auth.uid() = old.user_id then
    if old.status <> 'published' then
      raise exception 'REVIEW_HIDDEN_READONLY';
    end if;
    new.status := old.status;
    new.hidden_reason := old.hidden_reason;
    new.hidden_by := old.hidden_by;
    new.hidden_at := old.hidden_at;
    return new;
  end if;

  -- Moderation path: visibility only, never the customer's words.
  if not public.has_permission('review.manage_reports') then
    raise exception 'REVIEW_UPDATE_FORBIDDEN';
  end if;

  new.rating := old.rating;
  new.title := old.title;
  new.body := old.body;

  if new.status is not distinct from old.status then
    new.hidden_reason := old.hidden_reason;
    new.hidden_by := old.hidden_by;
    new.hidden_at := old.hidden_at;
  elsif new.status = 'hidden' and old.status = 'published' then
    if char_length(btrim(coalesce(new.hidden_reason, ''))) < 3 then
      raise exception 'REVIEW_HIDE_REASON_REQUIRED';
    end if;
    new.hidden_by := auth.uid();
    new.hidden_at := now();
  else
    raise exception 'REVIEW_STATUS_TRANSITION_INVALID';
  end if;

  return new;
end;
$$;

revoke all on function public.product_reviews_guard() from public;
revoke all on function public.product_reviews_guard() from anon;
revoke all on function public.product_reviews_guard() from authenticated;

drop trigger if exists product_reviews_guard on public.product_reviews;
create trigger product_reviews_guard
  before insert or update on public.product_reviews
  for each row execute function public.product_reviews_guard();

create or replace function public.review_reports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review_author uuid;
  v_review_status text;
begin
  -- Maintenance path — see the identical note in product_reviews_guard().
  if public.requesting_role() in ('service_role', 'postgres', 'supabase_admin') then
    new.updated_at := now();
    if tg_op = 'INSERT' then
      new.id := coalesce(new.id, gen_random_uuid());
      new.created_at := now();
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    select r.user_id, r.status
      into v_review_author, v_review_status
      from public.product_reviews r
     where r.id = new.review_id;

    if v_review_author is null then
      raise exception 'REVIEW_NOT_FOUND';
    end if;

    if v_review_status <> 'published' then
      raise exception 'REVIEW_NOT_REPORTABLE';
    end if;

    if v_review_author = new.reporter_id then
      raise exception 'REVIEW_SELF_REPORT';
    end if;

    new.id := coalesce(new.id, gen_random_uuid());
    new.status := 'open';
    new.resolved_by := null;
    new.resolved_at := null;
    new.resolution_note := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE: the report's subject and evidence are immutable.
  new.id := old.id;
  new.review_id := old.review_id;
  new.reporter_id := old.reporter_id;
  new.reason := old.reason;
  new.details := old.details;
  new.created_at := old.created_at;
  new.updated_at := now();

  if old.status <> 'open' then
    raise exception 'REPORT_ALREADY_RESOLVED';
  end if;

  if new.status not in ('resolved', 'dismissed') then
    raise exception 'REPORT_STATUS_INVALID';
  end if;

  new.resolved_by := auth.uid();
  new.resolved_at := now();
  return new;
end;
$$;

revoke all on function public.review_reports_guard() from public;
revoke all on function public.review_reports_guard() from anon;
revoke all on function public.review_reports_guard() from authenticated;

drop trigger if exists review_reports_guard on public.review_reports;
create trigger review_reports_guard
  before insert or update on public.review_reports
  for each row execute function public.review_reports_guard();

-- ---------------------------------------------------------------------------
-- 4. Rating aggregation view
-- ---------------------------------------------------------------------------
-- security_invoker means base-table RLS applies to the calling role, so an
-- anonymous visitor can only ever aggregate published reviews. The explicit
-- `status = 'published'` filter also keeps an author's own hidden review out of
-- the numbers they see. Granted read-only to anon/authenticated.
create or replace view public.product_review_stats
with (security_invoker = true)
as
select
  product_id,
  count(*)::integer as review_count,
  round(avg(rating)::numeric, 2) as average_rating,
  count(*) filter (where rating = 5)::integer as rating_5,
  count(*) filter (where rating = 4)::integer as rating_4,
  count(*) filter (where rating = 3)::integer as rating_3,
  count(*) filter (where rating = 2)::integer as rating_2,
  count(*) filter (where rating = 1)::integer as rating_1
from public.product_reviews
where status = 'published'
group by product_id;

comment on view public.product_review_stats is
  'Published-review aggregates per product. security_invoker: base-table RLS applies.';

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.product_reviews enable row level security;
alter table public.review_reports enable row level security;

-- Public storefront: published reviews only, and only the publishable columns
-- (see the grants below).
drop policy if exists product_reviews_select_public on public.product_reviews;
create policy product_reviews_select_public on public.product_reviews
  for select to anon
  using (status = 'published');

-- Customers see published reviews, plus their own rows even when hidden.
-- Managers/admins see everything so they can investigate a report.
drop policy if exists product_reviews_select_visible on public.product_reviews;
create policy product_reviews_select_visible on public.product_reviews
  for select to authenticated
  using (
    status = 'published'
    or user_id = auth.uid()
    or public.has_permission('review.manage_reports')
  );

-- A review may only be inserted by its own author, for a product they actually
-- received. The trigger re-checks the same evidence inside the transaction.
drop policy if exists product_reviews_insert_own on public.product_reviews;
create policy product_reviews_insert_own on public.product_reviews
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_active_account()
    and status = 'published'
    and exists (
      select 1
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
      where oi.product_id = product_reviews.product_id
        and o.user_id = auth.uid()
        and o.status = 'delivered'
    )
  );

-- Authors update their own content; managers update visibility. Both USING and
-- WITH CHECK are present, and the guard trigger restricts the columns.
drop policy if exists product_reviews_update_owner_or_manager on public.product_reviews;
create policy product_reviews_update_owner_or_manager on public.product_reviews
  for update to authenticated
  using (
    (user_id = auth.uid() and public.is_active_account())
    or public.has_permission('review.manage_reports')
  )
  with check (
    (user_id = auth.uid() and public.is_active_account())
    or public.has_permission('review.manage_reports')
  );

-- No DELETE policy on purpose: customers never delete reviews, and managers
-- hide instead of destroying history.

drop policy if exists review_reports_select_own_or_manager on public.review_reports;
create policy review_reports_select_own_or_manager on public.review_reports
  for select to authenticated
  using (
    reporter_id = auth.uid()
    or public.has_permission('review.manage_reports')
  );

drop policy if exists review_reports_insert_own on public.review_reports;
create policy review_reports_insert_own on public.review_reports
  for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and public.is_active_account()
    and status = 'open'
    and exists (
      select 1
      from public.product_reviews r
      where r.id = review_reports.review_id
        and r.status = 'published'
        and r.user_id <> auth.uid()
    )
  );

-- Only managers/admins may resolve or dismiss a report.
drop policy if exists review_reports_update_manager on public.review_reports;
create policy review_reports_update_manager on public.review_reports
  for update to authenticated
  using (
    public.has_permission('review.manage_reports')
    and public.is_active_account()
  )
  with check (
    public.has_permission('review.manage_reports')
    and public.is_active_account()
  );

-- No DELETE policy on purpose: reports are part of the moderation record.

-- ---------------------------------------------------------------------------
-- 6. Grants — least privilege
-- ---------------------------------------------------------------------------
revoke all on table public.product_reviews from anon;
revoke all on table public.product_reviews from authenticated;
revoke all on table public.product_reviews from public;

revoke all on table public.review_reports from anon;
revoke all on table public.review_reports from authenticated;
revoke all on table public.review_reports from public;

revoke all on table public.product_review_stats from anon;
revoke all on table public.product_review_stats from authenticated;
revoke all on table public.product_review_stats from public;

-- Anonymous visitors may read ONLY the publishable columns of published rows.
-- user_id, order_item_id, hidden_by/hidden_at and hidden_reason are not
-- reachable from the public API at all.
grant select (
  id,
  product_id,
  rating,
  title,
  body,
  display_name,
  status,
  created_at,
  updated_at
) on table public.product_reviews to anon;

-- Authenticated readers: everything the app renders, still without the
-- purchase-evidence or moderation-actor columns.
grant select (
  id,
  product_id,
  user_id,
  rating,
  title,
  body,
  display_name,
  status,
  hidden_reason,
  created_at,
  updated_at
) on table public.product_reviews to authenticated;

-- Column-level INSERT: these five fields are the only things an author supplies.
-- display_name, order_item_id, status and hidden_* are trigger-derived, so a
-- forged payload is rejected by the grant itself.
grant insert (product_id, user_id, rating, title, body)
  on table public.product_reviews to authenticated;

-- UPDATE is column-restricted by the guard trigger (RLS cannot express it);
-- the grant must stay table-level because managers and authors share the
-- `authenticated` database role.
grant update on table public.product_reviews to authenticated;

revoke delete on table public.product_reviews from authenticated;

grant select (
  id,
  review_id,
  reporter_id,
  reason,
  details,
  status,
  resolution_note,
  created_at,
  updated_at
) on table public.review_reports to authenticated;

grant insert (review_id, reporter_id, reason, details)
  on table public.review_reports to authenticated;

grant update (status, resolution_note)
  on table public.review_reports to authenticated;

revoke delete on table public.review_reports from authenticated;

-- Read-only aggregate surface.
grant select on table public.product_review_stats to anon;
grant select on table public.product_review_stats to authenticated;

-- Maintenance path.
grant select, insert, update, delete on table public.product_reviews to service_role;
grant select, insert, update, delete on table public.review_reports to service_role;
grant select on table public.product_review_stats to service_role;

-- ---------------------------------------------------------------------------
-- 7. RBAC: review.manage_reports (Manager + Admin only)
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  (
    'review.manage_reports',
    'Investigate reported reviews and hide reviews that violate policy'
  )
on conflict (key) do update
  set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'review.manage_reports'
where r.name in ('manager', 'admin')
on conflict (role_id, permission_id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Self-verification block
-- ---------------------------------------------------------------------------
do $$
declare
  v_reviews_rls boolean;
  v_reports_rls boolean;
  v_unique_pair boolean;
  v_unique_report boolean;
  v_rating_check boolean;
  v_status_check boolean;
  v_hidden_reason_check boolean;
  v_product_fk_restrict boolean;
  v_user_fk_cascade boolean;
  v_review_index boolean;
  v_report_index boolean;
  v_stats_view boolean;
  v_insert_policy boolean;
  v_update_policy boolean;
  v_update_with_check boolean;
  v_delete_policy integer;
  v_anon_policy integer;
  v_anon_insert boolean;
  v_anon_update boolean;
  v_anon_delete boolean;
  v_anon_user_id_read boolean;
  v_anon_evidence_read boolean;
  v_auth_evidence_read boolean;
  v_auth_delete boolean;
  v_auth_insert_rating boolean;
  v_auth_insert_status boolean;
  v_reports_anon_any boolean;
  v_reports_update_policy boolean;
  v_trigger_count integer;
  v_guard_definer boolean;
  v_guard_search_path text;
  v_reports_guard_definer boolean;
  v_reports_guard_search_path text;
  v_perm_exists boolean;
  v_perm_manager boolean;
  v_perm_admin boolean;
  v_perm_staff boolean;
  v_perm_customer boolean;
begin
  -- 1. RLS enabled
  select relrowsecurity into v_reviews_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'product_reviews';

  select relrowsecurity into v_reports_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'review_reports';

  if not coalesce(v_reviews_rls, false) or not coalesce(v_reports_rls, false) then
    raise exception 'Migration 0015 failed: RLS is not enabled on product_reviews/review_reports';
  end if;

  -- 2. Unique (user_id, product_id)
  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'product_reviews'
      and con.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      ) = ARRAY['product_id', 'user_id']::text[]
  ) into v_unique_pair;

  if not v_unique_pair then
    raise exception 'Migration 0015 failed: product_reviews lacks UNIQUE (user_id, product_id)';
  end if;

  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'review_reports'
      and con.contype = 'u'
      and (
        select array_agg(a.attname::text order by a.attname::text)
        from unnest(con.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
      ) = ARRAY['reporter_id', 'review_id']::text[]
  ) into v_unique_report;

  if not v_unique_report then
    raise exception 'Migration 0015 failed: review_reports lacks UNIQUE (review_id, reporter_id)';
  end if;

  -- 3. Rating / status / hidden-reason checks
  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'product_reviews'
      and con.conname = 'product_reviews_rating_check'
  ) into v_rating_check;

  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'product_reviews'
      and con.conname = 'product_reviews_status_check'
  ) into v_status_check;

  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'product_reviews'
      and con.conname = 'product_reviews_hidden_reason_check'
  ) into v_hidden_reason_check;

  if not (v_rating_check and v_status_check and v_hidden_reason_check) then
    raise exception 'Migration 0015 failed: product_reviews is missing a rating/status/hidden-reason CHECK constraint';
  end if;

  -- 4. Foreign keys: product restrict, author cascade
  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'product_reviews'
      and con.contype = 'f'
      and con.confrelid = 'public.products'::regclass
      and con.confdeltype = 'r'
  ) into v_product_fk_restrict;

  select exists (
    select 1 from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'product_reviews'
      and con.contype = 'f'
      and con.confrelid = 'public.profiles'::regclass
      and con.confdeltype = 'c'
  ) into v_user_fk_cascade;

  if not v_product_fk_restrict then
    raise exception 'Migration 0015 failed: product_reviews.product_id must be ON DELETE RESTRICT (preserve review history)';
  end if;

  if not v_user_fk_cascade then
    raise exception 'Migration 0015 failed: product_reviews.user_id must reference profiles(id) ON DELETE CASCADE';
  end if;

  -- 5. Indexes + stats view
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'product_reviews_product_status_created_idx'
  ) into v_review_index;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'review_reports_status_created_idx'
  ) into v_report_index;

  select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'product_review_stats' and c.relkind = 'v'
  ) into v_stats_view;

  if not (v_review_index and v_report_index and v_stats_view) then
    raise exception 'Migration 0015 failed: expected indexes or public.product_review_stats view are missing';
  end if;

  -- 6. Policies
  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_reviews'
      and policyname = 'product_reviews_insert_own' and cmd = 'INSERT'
  ) into v_insert_policy;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_reviews'
      and policyname = 'product_reviews_update_owner_or_manager' and cmd = 'UPDATE'
  ) into v_update_policy;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_reviews'
      and policyname = 'product_reviews_update_owner_or_manager'
      and qual is not null and with_check is not null
  ) into v_update_with_check;

  select count(*) into v_delete_policy
  from pg_policies
  where schemaname = 'public'
    and tablename in ('product_reviews', 'review_reports')
    and cmd = 'DELETE';

  select count(*) into v_anon_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'review_reports'
    and 'anon' = any (roles);

  if not v_insert_policy then
    raise exception 'Migration 0015 failed: product_reviews_insert_own is missing';
  end if;

  if not (v_update_policy and v_update_with_check) then
    raise exception 'Migration 0015 failed: product_reviews UPDATE policy must have both USING and WITH CHECK';
  end if;

  if v_delete_policy <> 0 then
    raise exception 'Migration 0015 failed: a DELETE policy exists on product_reviews/review_reports';
  end if;

  if v_anon_policy <> 0 then
    raise exception 'Migration 0015 failed: an anon policy exists on review_reports';
  end if;

  -- 7. Grants
  select has_table_privilege('anon', 'public.product_reviews', 'insert') into v_anon_insert;
  select has_table_privilege('anon', 'public.product_reviews', 'update') into v_anon_update;
  select has_table_privilege('anon', 'public.product_reviews', 'delete') into v_anon_delete;

  select has_column_privilege('anon', 'public.product_reviews', 'user_id', 'select')
  into v_anon_user_id_read;

  select has_column_privilege('anon', 'public.product_reviews', 'order_item_id', 'select')
  into v_anon_evidence_read;

  select has_column_privilege('authenticated', 'public.product_reviews', 'order_item_id', 'select')
  into v_auth_evidence_read;

  select has_table_privilege('authenticated', 'public.product_reviews', 'delete')
  into v_auth_delete;

  select has_column_privilege('authenticated', 'public.product_reviews', 'rating', 'insert')
  into v_auth_insert_rating;

  select has_column_privilege('authenticated', 'public.product_reviews', 'status', 'insert')
  into v_auth_insert_status;

  select
    has_table_privilege('anon', 'public.review_reports', 'select')
    or has_table_privilege('anon', 'public.review_reports', 'insert')
    or has_table_privilege('anon', 'public.review_reports', 'update')
    or has_table_privilege('anon', 'public.review_reports', 'delete')
  into v_reports_anon_any;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_reports'
      and policyname = 'review_reports_update_manager' and cmd = 'UPDATE'
      and qual is not null and with_check is not null
  ) into v_reports_update_policy;

  if v_anon_insert or v_anon_update or v_anon_delete then
    raise exception 'Migration 0015 failed: anon unexpectedly holds write privileges on product_reviews';
  end if;

  if v_anon_user_id_read or v_anon_evidence_read then
    raise exception 'Migration 0015 failed: anon can read user_id/order_item_id from product_reviews';
  end if;

  if v_auth_evidence_read then
    raise exception 'Migration 0015 failed: authenticated can read order_item_id from product_reviews';
  end if;

  if v_auth_delete then
    raise exception 'Migration 0015 failed: authenticated holds DELETE on product_reviews';
  end if;

  if not v_auth_insert_rating or v_auth_insert_status then
    raise exception 'Migration 0015 failed: author INSERT must be column-restricted to the five content fields';
  end if;

  if v_reports_anon_any then
    raise exception 'Migration 0015 failed: anon holds privileges on review_reports';
  end if;

  if not v_reports_update_policy then
    raise exception 'Migration 0015 failed: review_reports_update_manager must exist with USING and WITH CHECK';
  end if;

  -- 8. Triggers
  select count(*) into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and (
      (c.relname = 'product_reviews' and t.tgname = 'product_reviews_guard')
      or (c.relname = 'review_reports' and t.tgname = 'review_reports_guard')
    );

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
  into v_guard_definer, v_guard_search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'product_reviews_guard';

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '')
  into v_reports_guard_definer, v_reports_guard_search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'review_reports_guard';

  if v_trigger_count <> 2 then
    raise exception 'Migration 0015 failed: expected both guard triggers, found %', v_trigger_count;
  end if;

  if not coalesce(v_guard_definer, false) then
    raise exception 'Migration 0015 failed: product_reviews_guard must be SECURITY DEFINER';
  end if;

  if v_guard_search_path not like '%search_path=%' then
    raise exception 'Migration 0015 failed: product_reviews_guard must pin an empty search_path (found %)', v_guard_search_path;
  end if;

  if not coalesce(v_reports_guard_definer, false) then
    raise exception 'Migration 0015 failed: review_reports_guard must be SECURITY DEFINER';
  end if;

  if v_reports_guard_search_path not like '%search_path=%' then
    raise exception 'Migration 0015 failed: review_reports_guard must pin an empty search_path (found %)', v_reports_guard_search_path;
  end if;

  -- 9. Permission scope
  select exists (select 1 from public.permissions where key = 'review.manage_reports')
  into v_perm_exists;

  if not v_perm_exists then
    raise exception 'Migration 0015 failed: review.manage_reports permission is missing';
  end if;

  select exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where p.key = 'review.manage_reports' and r.name = 'manager'
  ) into v_perm_manager;

  select exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where p.key = 'review.manage_reports' and r.name = 'admin'
  ) into v_perm_admin;

  select exists (
    select 1 from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id
    where p.key = 'review.manage_reports' and r.name in ('staff', 'customer')
  ) into v_perm_staff;

  if not (v_perm_manager and v_perm_admin) then
    raise exception 'Migration 0015 failed: review.manage_reports must be granted to manager and admin';
  end if;

  if v_perm_staff then
    raise exception 'Migration 0015 failed: review.manage_reports must not be granted to staff or customer';
  end if;

  raise notice '--- Solenne 0015 OK: product_reviews + review_reports created, RLS + guard triggers enforced, anon sees published rows only, review.manage_reports granted to manager/admin ---';
end $$;
