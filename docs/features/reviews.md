# Verified Customer Reviews

Verified-purchase reviews on the product page: a rating, a title, a body, the
author's privacy-safe display name, and a "Verified purchase" badge. Publication
is **immediate** — there is no pending state, no approval queue, and no
pre-publication moderation. Abuse is handled *after* publication through
customer reports and an audited manager/admin moderation queue.

- **Branch**: `feat/verified-reviews`
- **Migration**: `supabase/migrations/0015_reviews.sql` — **authored but NOT
  applied to any database.** Nothing in this document claims a production
  change.
- **Permission**: `review.manage_reports` — Manager + Admin only. Added by
  `0015`, so it is absent from the live catalogue until `0015` is applied.
- **Runtime dependency**: the customer UI, the actions and the admin queue are
  fully wired. Until `0015` is applied, reviews read as "unavailable" on the
  product page and every write returns a localized failure; the rest of the
  storefront is unaffected.

---

## 1. Requirements → design

| Requirement | How it is met |
| --- | --- |
| Only verified buyers may review | The INSERT policy *and* the guard trigger require a `delivered` order item owned by the caller for the product |
| Verification cannot be spoofed | No client-writable `verified_purchase` column; the trigger derives `order_item_id` from trusted tables |
| One review per customer per product | `UNIQUE (user_id, product_id)`; a repeat purchase can only edit |
| Immediate publication | `status` defaults to `published`; the trigger forces it on insert; no approval state exists |
| 1–5 stars | `CHECK (rating between 1 and 5)` + Zod + a pure predicate |
| Reports never hide anything | A report lands in `review_reports`; hiding is a separate audited action |
| No `user_id` / `order_item_id` / email / phone in public data | Column-level grants for `anon`; the public type has no such fields |
| No destructive history loss | `product_id` is `ON DELETE RESTRICT`; there is no DELETE grant/policy |
| Least privilege | `anon` reads published publishable columns only; no `grant all`, no `TRUNCATE` |
| Auditable moderation | `review.hidden`, `review.report_resolved`, `review.report_dismissed` in `audit_logs` |
| Bilingual | `reviews.*` (customer) and `reviewsAdmin.*` (back office) in `messages/en.json` / `messages/vi.json` |

---

## 2. Architecture

```
Product page (RSC)  app/(marketing)/products/[slug]/page.tsx
  └─ getProductReviewsPageData(productId)              lib/reviews.ts   ← one server pass
       └─ <ProductReviews data={…} loginHref={…} />    components/reviews/product-reviews.tsx
            ├─ <ReviewSummary />                        average, count, 5→1 distribution
            ├─ <ReviewForm mode="create" | "edit" />    createReviewAction / updateReviewAction
            └─ <ReviewReportControl />                  reportReviewAction
                 └─ user-scoped Supabase client → RLS   lib/supabase/server.ts
```

```
/account/orders (RSC)
  └─ <ReviewInvitation /> (own Suspense)               components/reviews/review-invitation.tsx
       └─ getReviewableDeliveredItems()                lib/reviews.ts
            └─ "write" / "edit" → /products/<slug>#reviews
```

```
/admin/reviews (RSC)                                   app/admin/reviews/page.tsx
  ├─ requirePermission("review.manage_reports")
  ├─ getAdminReviewReports(filter) / countOpenReviewReports()   lib/admin-reviews.ts
  └─ <ReviewModerationControl report review />         components/admin/review-moderation-control.tsx
       ├─ hideReviewAction()                           app/actions/review-moderation.ts
       └─ resolveReviewReportAction("resolved" | "dismissed")
```

### Files

| Path | Role |
| --- | --- |
| `supabase/migrations/0015_reviews.sql` | Tables, indexes, guard triggers, stats view, RLS, grants, permission seed, self-verification |
| `types/review.ts` | `ProductReview`, `ReviewSummary`, `ReviewEligibility`, `ReviewReport`, `ProductReviewsPageData`, … |
| `lib/reviews-core.ts` | Pure rules: rating/sort/reason validation, summary math, eligibility, reportability, error→message-key maps |
| `lib/validations/reviews.ts` | Zod schemas + action-state/error-code types |
| `lib/reviews.ts` | Server data layer (guest-safe page payload, strict eligibility, reviewable items) |
| `lib/admin-reviews.ts` | Moderation queue read + open-report count (permission-gated) |
| `app/actions/reviews.ts` | `createReviewAction`, `updateReviewAction`, `reportReviewAction` |
| `app/actions/review-moderation.ts` | `hideReviewAction`, `resolveReviewReportAction` |
| `components/reviews/*` | Star rating (display/input), summary, form, report control, reviews section, account invitation |
| `components/admin/review-moderation-control.tsx` | Hide / resolve / dismiss control |
| `app/admin/reviews/page.tsx` | Report-centric moderation queue |
| `app/(marketing)/products/[slug]/page.tsx` | Mounts the reviews section (`#reviews`) |
| `app/(marketing)/account/orders/page.tsx` | Mounts `<ReviewInvitation />` |
| `lib/admin-nav.ts` / `lib/redirect.ts` | Nav entry + `MANAGEMENT_PERMISSIONS` |
| `lib/audit-utils.ts` | Audit action labels/categories for the three review actions |
| `messages/en.json` / `messages/vi.json` | `reviews` (83 keys) and `reviewsAdmin` (65 keys) |
| `tests/unit/reviews-core.test.ts` | 28 unit tests over the pure rules |
| `scripts/verify-reviews.mjs` | 330 static assertions (schema, RLS, grants, actions, UI, i18n) |

---

## 3. Data model (`0015`)

```sql
create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  rating smallint not null,          -- check (1..5)
  title text not null,               -- 3..120 trimmed
  body text not null,                -- 10..4000 trimmed
  display_name text,                 -- trigger-derived snapshot, <= 60
  status text not null default 'published',   -- 'published' | 'hidden'
  hidden_reason text,
  hidden_by uuid,                    -- no FK: the trail survives account deletion
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_reviews_user_product_key unique (user_id, product_id),
  constraint product_reviews_status_check check (status in ('published','hidden')),
  constraint product_reviews_hidden_reason_check
    check (status <> 'hidden' or char_length(btrim(coalesce(hidden_reason,''))) >= 3)
);

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,              -- spam | abuse | harassment | personal_information | irrelevant | other
  details text,                      -- <= 1000
  status text not null default 'open',   -- 'open' | 'resolved' | 'dismissed'
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,              -- <= 500
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_reports_review_reporter_key unique (review_id, reporter_id)
);
```

Indexes:

- `product_reviews_product_status_created_idx (product_id, status, created_at desc) INCLUDE (rating)`
  serves both the public listing and the aggregate (index-only).
- `review_reports_status_created_idx (status, created_at desc)` serves the queue.
- `review_reports_reporter_idx (reporter_id)` serves the reporter cascade and
  "did I already report this?".

Why `ON DELETE RESTRICT` on `product_id`: a hard-deleted product would silently
erase review history. The existing admin delete path already refuses products
referenced by `order_items`, and a review requires such an item, so practical
behaviour does not change. `user_id` cascades so deleting an account removes
that author's own rows instead of leaving orphans.

---

## 4. Verification is structural, not a flag

There is deliberately **no** `verified_purchase` boolean. A row is verified by
construction, in three independent layers:

1. **INSERT policy** (`product_reviews_insert_own`) requires
   `user_id = auth.uid()`, `is_active_account()`, `status = 'published'`, and an
   `EXISTS` over `order_items ⋈ orders` where the item's product is the reviewed
   product, the order belongs to the caller, and `orders.status = 'delivered'`.
2. **Guard trigger** (`product_reviews_guard`, `BEFORE INSERT`) re-runs the same
   lookup inside the transaction, stores the qualifying `order_item_id`, derives
   `display_name` from `profiles.full_name`, and **overwrites** `status`,
   `hidden_*`, `created_at` and `updated_at`. A forged payload cannot claim a
   purchase because the evidence never comes from the request.
3. **Column-level INSERT grant** `(product_id, user_id, rating, title, body)` —
   a client that tries to send `status`, `display_name`, `order_item_id` or
   `hidden_*` is rejected by the grant before the trigger even runs.

`lib/reviews-core.ts#qualifiesAsVerifiedPurchase` mirrors the predicate so the
rule is explicit and unit-testable. The database remains the authority.

---

## 5. RLS, grants and column authority

```sql
-- public storefront
create policy product_reviews_select_public on public.product_reviews
  for select to anon using (status = 'published');

-- customers: published + their own (even hidden) + managers see everything
create policy product_reviews_select_visible on public.product_reviews
  for select to authenticated
  using (status = 'published' or user_id = auth.uid()
         or public.has_permission('review.manage_reports'));

create policy product_reviews_insert_own on public.product_reviews
  for insert to authenticated with check (… delivered evidence …);

create policy product_reviews_update_owner_or_manager on public.product_reviews
  for update to authenticated
  using (…) with check (…);   -- both sides present

-- reports
create policy review_reports_select_own_or_manager …  -- reporter or manager
create policy review_reports_insert_own …            -- published review, not own
create policy review_reports_update_manager …        -- permission + active account
```

- **No DELETE policy on either table.** Customers never delete reviews; managers
  hide rather than destroy history; reports are part of the moderation record.
- **`anon` column grant** is exactly `id, product_id, rating, title, body,
  display_name, status, created_at, updated_at`. `user_id`, `order_item_id`,
  `hidden_by`/`hidden_at` and `hidden_reason` are unreachable from the public
  API.
- **`authenticated` SELECT** adds `user_id` and `hidden_reason` (the author's own
  hidden notice) but still no purchase evidence or moderation actor.
- **UPDATE column authority** cannot be expressed in RLS, so the trigger pins
  identity/evidence/name and splits the two legitimate paths:
  - author (`auth.uid() = old.user_id`): content only, and only while
    `published` — a hidden review raises `REVIEW_HIDDEN_READONLY`;
  - manager (`has_permission('review.manage_reports')`): visibility only, with a
    mandatory reason (`REVIEW_HIDE_REASON_REQUIRED`) and a one-way
    `published → hidden` transition.
- **Trusted-role escape**: `service_role` / `postgres` / `supabase_admin` bypass
  the guard for data repair, mirroring `0001`'s profile guard. They already
  bypass RLS.
- **Active-account guard**: `is_active_account()` on every customer policy means
  suspending or banning an account revokes review access in the database
  immediately.

### Aggregate view

```sql
create view public.product_review_stats
with (security_invoker = true) as
select product_id, count(*)::integer as review_count,
       round(avg(rating)::numeric, 2) as average_rating,
       count(*) filter (where rating = 5)::integer as rating_5,
       … rating_4 … rating_1
from public.product_reviews
where status = 'published'
group by product_id;
```

`security_invoker` means the caller's RLS applies, so an anonymous visitor can
only aggregate published rows. The explicit filter also keeps an author's own
hidden review out of the numbers they see. `SELECT` is granted to
`anon`/`authenticated`; nothing else.

### Self-verification

The migration ends with a `DO $$ … $$` block that `RAISE EXCEPTION`s unless the
end state is correct: both tables present, RLS on, guard triggers installed,
unique pairs and cascades right, the view present and `security_invoker`, every
policy present with `USING` + `WITH CHECK` where required, no DELETE grant, the
expected column grants, and `review.manage_reports` granted to manager/admin but
not staff/customer. On success it prints:

```
--- Solenne 0015 OK: product_reviews + review_reports created, RLS + guard triggers enforced, anon sees published rows only, review.manage_reports granted to manager/admin ---
```

---

## 6. Customer actions

`app/actions/reviews.ts` — `"use server"`, user-scoped client only (never the
service-role client).

### `createReviewAction({ productId, rating, title, body })`

1. `requireActiveActor()` — identity comes from the session; a payload `userId`
   is not read at all.
2. Zod validates the id shape and the 1–5 / length rules.
3. The product must exist and be `is_active` → otherwise `unavailable`.
4. `getReviewEligibilityForViewer()` re-reads the delivered evidence **before**
   the insert (`not_eligible` / `duplicate`).
5. Insert exactly `{ product_id, user_id: actor.userId, rating, title, body }`.
6. Postgres re-proves eligibility (policy + trigger). `23505` → `duplicate`;
   `REVIEW_ELIGIBILITY_REQUIRED`/`42501` → `not_eligible`.
7. `revalidatePath` for the product page, `/products`, `/account/orders`,
   `/admin/reviews`.

### `updateReviewAction({ productId, rating, title, body })`

Updates only `{ rating, title, body }` for `product_id + user_id = actor`. A
repeat purchase therefore edits the existing row; it never creates a second
rating. A hidden review returns `hidden_readonly`.

### `reportReviewAction({ reviewId, reason, details? })`

Inserts `{ review_id, reporter_id: actor.userId, reason, details }`. The trigger
rejects a hidden review (`REVIEW_NOT_REPORTABLE`), the author's own review
(`REVIEW_SELF_REPORT`) and a missing review (`REVIEW_NOT_FOUND`); the unique
`(review_id, reporter_id)` makes reporting idempotent (`already_reported`).
A report **never** changes the review's visibility.

Every failure returns a machine-readable `code`; the UI renders `reviews.*` copy
through `reviewErrorKey()` rather than an English sentence.

---

## 7. Moderation (`review.manage_reports`)

`app/actions/review-moderation.ts` — both actions call
`requirePermission("review.manage_reports")` and use the user-scoped client, so
the policies and guard triggers re-check the permission inside the database.

- **`hideReviewAction({ reviewId, reason })`** — mandatory reason (≥ 3 chars),
  one-way `published → hidden`. Already-hidden is an idempotent success with no
  duplicate audit row. Writes `review.hidden` with
  `{ review_id, product_id, review_title, reason }`.
- **`resolveReviewReportAction({ reportId, resolution: "resolved" | "dismissed", note? })`**
  — closes only the report. Writes `review.report_resolved` or
  `review.report_dismissed` with `{ report_id, review_id, resolution, note }`.
  Re-submitting a closed report is an idempotent success.

Hiding and closing are deliberately separate: a report never hides anything by
itself, and hiding does not silently close the report that prompted it. Audit
rows are written through the admin client because `audit_logs` grants nothing to
`authenticated`; a failed audit write is logged but never blocks the moderation
action.

The queue at `/admin/reviews` is report-centric (`?status=open|resolved|dismissed|all`),
shows the reported review beside the complaint, and degrades honestly when
`0015` is absent (`schemaUnavailable`), the caller is restricted, lacks the
permission, or the read fails. It exposes neither the reporter's identity nor
their contact details.

---

## 8. Customer UI

- **Product page** (`#reviews`): section heading + subtitle, header action
  (write / edit / "verified buyers only" / login link), the summary
  (average, count, 5→1 bars with `role="img"`-safe labels), a client-side sort
  (`newest` / `oldest` / `highest` / `lowest`) over the loaded window
  (`REVIEW_LIST_LIMIT = 50`), then the list.
- **Review card**: display name (or localized "Anonymous"), a "Verified
  purchase" badge with a check icon, "Your review" when it is the viewer's,
  stars with an accessible `ratingOutOfFive` label, the date, title and body.
  The report control appears only for signed-in viewers on someone else's
  published review, and reads "Reported" once submitted.
- **Form**: interactive 1–5 star input (radio group with a labelled fieldset),
  title and body with `aria-invalid`/`aria-describedby` field errors, a live
  status region, and a cancel action. Guests never see the form — they are sent
  to `/login?next=/products/<slug>#reviews`.
- **Hidden review (author view)**: a `role="status"` notice with the reason, and
  no edit affordance (the trigger refuses edits anyway).
- **Unavailable schema**: a plain "reviews are temporarily unavailable" panel;
  the rest of the product page still renders.
- **`/account/orders`**: an "awaiting your review" list of delivered, still-active
  products, linking to `#reviews` with "write" or "edit". It is supplementary:
  a failure logs and disappears rather than breaking order history.

Accessibility: semantic `section`/`article`/`ul`, a labelled sort `<select>`,
radio-based star input, `aria-live` announcements for publish/report, visible
focus rings, and reduced-motion safety inherited from the global stylesheet.

---

## 9. Localization

All customer copy lives under `reviews.*` (83 keys) and back-office copy under
`reviewsAdmin.*` (65 keys), identical in `messages/en.json` and
`messages/vi.json`. `scripts/verify-reviews.mjs` fails when:

- the two locales expose different keys or an empty value;
- a `t("…")` key used by a component has no catalogue entry (including the
  dynamically selected sort, reason and error keys);
- the two locales are copy-pasted English;
- a Vietnamese file loses a translated string.

---

## 10. Applying the migration (manual, out-of-band)

> **`0015` has NOT been run against any database. Do not claim it has.**
> There is no migration runner in this repo; migrations are pasted into the
> Supabase SQL editor by hand.

1. Confirm `0001`–`0014` are applied. `0015` depends on
   `public.is_active_account()`, `public.has_permission()` and
   `public.requesting_role()` from `0001`; it raises immediately if any is
   missing.
2. Open the Supabase dashboard → SQL editor for the intended **non-production**
   project first.
3. Paste the entire contents of `supabase/migrations/0015_reviews.sql` and run
   it once. It is idempotent (`if not exists`, `create or replace`, `drop policy
   if exists`).
4. Expect `--- Solenne 0015 OK: …`. Any other outcome means the verification
   block raised and the transaction rolled back — read the message, fix the
   cause, re-run.
5. Verify from the API: `GET /rest/v1/` with the secret key should list
   `product_reviews`, `review_reports` and `product_review_stats` in
   `definitions`, and `/permissions` should include `review.manage_reports`.
6. **Never re-run `0013`, `0014` or any earlier migration** as part of this
   step. In particular, do not re-run `0002`: it rebuilds the role→permission
   matrix and would drop the `review.manage_reports` grant.
7. Rollback, if ever required, is a separate reviewed migration
   (`drop view`, `drop table review_reports`, `drop table product_reviews`,
   remove the permission grant). No rollback script is shipped.

---

## 11. Local verification

```bash
pnpm typecheck                 # next typegen && tsc --noEmit
pnpm lint
pnpm test:unit                 # includes tests/unit/reviews-core.test.ts
pnpm test:verify               # 13 harnesses, incl. verify-reviews.mjs (330 assertions)
pnpm build                     # also runs the product-image generator
```

`node scripts/verify-reviews.mjs` runs alone and is entirely static — no
database, no network, no credentials.

Manual checks that need a real account (only after `0015` is applied to the
project you are pointed at):

1. Guest on a product page: reviews render (published only), the header action
   is "Write a review" → `/login?next=…`; no form is shown.
2. Customer **without** a delivered order: "Verified buyers only"; posting
   directly to the action returns `not_eligible`.
3. Customer **with** a delivered order: write a review → it appears immediately,
   the average/count/distribution update, and the badge reads "Verified
   purchase".
4. Submit a second review for the same product → the UI offers "Edit your
   review"; a forged second insert returns `duplicate`.
5. Customer B cannot see A's `user_id`/`order_item_id` in any response; `anon`
   cannot select those columns at all.
6. Report someone else's review → it is listed at `/admin/reviews?status=open`;
   the review is still public until a manager hides it.
7. Staff cannot open `/admin/reviews` (403); manager/admin can. Hide with a
   reason → the review disappears from the storefront, the author sees the
   hidden notice, and `audit_logs` gains `review.hidden`.
8. Resolve/dismiss the report → `review.report_resolved` /
   `review.report_dismissed`; the review's visibility is unchanged.
9. Vietnamese locale → every customer and admin string is translated.

---

## 12. Remaining limitations

- **`0015` is not applied.** Until it is, the product page shows the
  "unavailable" panel and every write returns a localized failure. The admin
  queue shows its explicit schema-unavailable state.
- **No live RLS test.** No test asserts "customer B cannot read customer A's
  evidence" against a real database, because that needs a dedicated
  non-production project and local Supabase/Docker is unavailable in this
  environment. Policies, grants and triggers are verified statically by
  `verify-reviews.mjs`; enforcement itself is Postgres's job.
- **No staging E2E journey.** The review flow is not in a CI Playwright journey
  (those require `SOLENNE_E2E_BASE_URL` and a seeded project). It is covered by
  28 unit tests and 330 static assertions.
- **No pagination.** The storefront loads the newest 50 published reviews and
  sorts that window client-side. Older reviews are not reachable yet.
- **No review editing window.** Authors may edit their review indefinitely while
  it is published (product decision, not an oversight).
- **No image attachments, helpfulness votes or replies.** Out of scope for this
  phase.
- **Reports are not rate-limited beyond one-per-customer-per-review.** A
  determined reporter can report many different reviews; the queue is capped at
  100 entries per read.
- **Hidden reviews are terminal.** There is no "restore" action; a manager can
  only hide. Restoring would need a reviewed migration and a new audited action.
