# Wishlist

A per-customer saved-products list: a heart on every product card, a heart on the
product detail page, and a dedicated `/account/wishlist` page. Saving survives
reloads and devices because it is stored in Postgres, not `localStorage`.

- **Branch**: `feat/wishlist`
- **Migration**: `supabase/migrations/0014_wishlist.sql` — **authored but NOT
  applied to any database.** Nothing in this document claims a production change.
- **Runtime dependency**: the feature is fully wired, but its writes need `0014`
  applied. Until then the catalogue renders normally (hearts degrade to
  "unsaved") and every save returns a localized failure toast.

---

## 1. Why it exists

The heart was previously decorative: `ProductCard` rendered a `<Heart>` inside
the product `<Link>` with no handler, and `ProductInfo` rendered an inactive
"Add to Wishlist" ghost button. Both are now one real, shared control.

The requirements shaped the design:

| Requirement | How it is met |
| --- | --- |
| Persist per customer | `public.wishlist_items`, one row per (user, product) |
| No service-role key for customer data | Server actions use the **user-scoped** Supabase client; RLS is the enforcement point |
| No anonymous access | `anon` holds no privilege; guests are redirected to login before any write |
| No user-settable ownership | `user_id` comes only from `requireActiveActor()`; RLS re-checks it; no `UPDATE` grant exists |
| No `FOR ALL` policy | Three per-command policies (`select` / `insert` / `delete`) |
| No per-card request | One provider per page, hydrated from a single server read |
| Bilingual | Every string lives in `messages/en.json` / `messages/vi.json` |

---

## 2. Architecture

```
Server page (RSC)
  └─ getWishlistProductIdsForViewer()        lib/wishlist.ts   ← one query, or none for guests
       └─ <WishlistProvider initialIds={…}>  client store      ← components/wishlist
            └─ <WishlistButton productId=…/> every heart on the page reads the same store
                 └─ addToWishlistAction / removeFromWishlistAction   app/actions/wishlist.ts
                      └─ user-scoped Supabase client → RLS          lib/supabase/server.ts
```

### Files

| Path | Role |
| --- | --- |
| `supabase/migrations/0014_wishlist.sql` | Table, indexes, RLS policies, grants, self-verification block |
| `lib/validations/wishlist.ts` | Zod schema for the product id + `WishlistActionState` / `WishlistErrorCode` |
| `lib/wishlist-core.ts` | Pure logic: id validation, `23505` detection, toggle, normalization, error→message key, login href |
| `lib/wishlist.ts` | Server data layer: guest-safe id reader + strict product reader |
| `lib/products.ts` | `getProductsByIds()` — batched product read (no N+1) |
| `app/actions/wishlist.ts` | `addToWishlistAction`, `removeFromWishlistAction` |
| `components/wishlist/wishlist-provider.tsx` | Shared store, optimistic writes, rollback, guest redirect, toast + live region |
| `components/wishlist/wishlist-button.tsx` | The single heart control (`icon` / `full` variants) |
| `components/wishlist/wishlist-item-row.tsx` | One saved product on `/account/wishlist` |
| `app/(marketing)/account/wishlist/page.tsx` | The wishlist page |
| `components/product/product-card.tsx` | Uses `WishlistButton` instead of a decorative heart |
| `components/product/product-info.tsx` | Uses the `full` variant instead of an inactive button |

### Where the provider is mounted

`/products`, `/collections/[slug]` and `/products/[slug]`. Each page performs
exactly one wishlist read and passes the ids down.

It is deliberately **not** in the root layout: `AuthzShell` already reads the
session per document, and a wishlist read at the root would force every static
page (journal, about, FAQ, …) to become dynamic. The home page is also excluded —
`FeaturedProducts` has never had hearts, and adding a provider there would
introduce a database read into the landing page for no visible control.

`/account/wishlist` hydrates its provider from the rows it renders
(`products.map(p => p.id)`), so a row is always "saved" at first paint and a
failed removal can restore it by rolling the store back — no per-row local state.

---

## 3. Data model (`0014`)

```sql
create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade on update cascade,
  product_id uuid not null references public.products(id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  constraint wishlist_items_user_product_key unique (user_id, product_id)
);

create index wishlist_items_user_created_idx on public.wishlist_items (user_id, created_at desc);
create index wishlist_items_product_idx on public.wishlist_items (product_id);
```

- **Cascade on both sides.** Deleting a customer removes their saved rows;
  deleting a product removes references to it, so no dangling row can exist.
- **`unique (user_id, product_id)`** is the idempotency contract (see §5).
- **`wishlist_items_user_created_idx`** serves the account listing without a
  sort pass; **`wishlist_items_product_idx`** serves the product cascade.

---

## 4. RLS ownership model

```sql
alter table public.wishlist_items enable row level security;

create policy wishlist_items_select_own on public.wishlist_items
  for select to authenticated
  using (user_id = auth.uid() and public.is_active_account());

create policy wishlist_items_insert_own on public.wishlist_items
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_account());

create policy wishlist_items_delete_own on public.wishlist_items
  for delete to authenticated
  using (user_id = auth.uid() and public.is_active_account());
```

Defence in depth, in order of authority:

1. **RLS** — a row is visible and mutable only to its owner. Even a forged
   request from a valid session cannot read or delete another customer's rows.
2. **Grants** — `anon` holds nothing; `authenticated` holds exactly `select`,
   `insert`, `delete`. **No `UPDATE`**: a wishlist row is immutable except for
   being created or removed, so neither `user_id` nor `product_id` can ever be
   rewritten — not even by its owner. There is no `FOR ALL` policy.
3. **Active-account guard** — `public.is_active_account()` (from `0001`) means
   suspending or banning an account revokes wishlist access in the database
   immediately, without an application deploy.
4. **Server action** — `requireActiveActor()` runs before any query, and the
   `user_id` it returns is the only one ever written.
5. **Validation** — only a bare uuid string is accepted, so ownership cannot be
   smuggled through the payload as an extra field.

`service_role` keeps `select, insert, delete` for maintenance tooling only. The
application never uses it for this table.

The migration ends with a `DO $$ … $$` block that `RAISE EXCEPTION`s unless the
end state is correct: table present, RLS on, unique pair present, both FKs
cascading, both indexes present, exactly three per-command policies, no `FOR ALL`
policy, no `anon` policy, all three guarded by `is_active_account()`, `anon`
holding nothing, `authenticated` holding no `UPDATE`, and `service_role` able to
`select`. On success it prints:

```
--- Solenne 0014 OK: wishlist_items created, RLS enabled, own-row policies with active-account guard, no anon access, no UPDATE grant ---
```

---

## 5. Server actions

`app/actions/wishlist.ts` — `"use server"`, no route handlers.

### `addToWishlistAction(input)`

1. `requireActiveActor()` → 401 becomes `{ code: "unauthenticated" }`, 403
   becomes `{ code: "restricted" }`. Nothing is queried first.
2. `parseWishlistProductId(input)` → `{ code: "validation" }` on anything that is
   not a uuid string (including objects that carry a `userId`).
3. The product must exist **and** `is_active`, otherwise
   `{ code: "product_unavailable" }` — a deactivated product can never be saved.
4. Insert `{ user_id: actor.userId, product_id }` through the user-scoped client.
5. **Idempotency**: a duplicate raises Postgres `23505`, which
   `isDuplicateWishlistError()` maps to success. Saving twice is not an error.
6. `revalidatePath` for `/account/wishlist`, `/products` and the product page.
7. Returns `{ success: true, saved: true, productId }`.

### `removeFromWishlistAction(input)`

Same authorization and validation, then `delete().eq("user_id", …).eq("product_id", …)`.
Removing something that is not saved is also a success — the desired end state
already holds. A genuine delete failure returns `{ code: "persist_failed" }`
rather than pretending the row is gone.

Every failure carries a machine-readable `code`; the UI renders localized copy
from `wishlist.*` via `wishlistErrorKey()` instead of the English `error` string.

---

## 6. Client behaviour

- **State** — one provider per page, seeded from the server. `ids.includes(id)`
  is the saved state for every heart, so a card and the detail page can never
  disagree.
- **Optimistic writes** — the id flips locally, the action runs, and on failure
  **only that id** is flipped back. A concurrent save of another product is never
  reverted.
- **Pending** — a save in flight shows a spinner, sets `aria-busy`, and is
  disabled; a second click on the same product is ignored.
- **Guests** — `authState === "anonymous"` routes to
  `/login?next=<current internal path>` before any request. No row is created and
  no password-less path exists. `isSafeWishlistReturnPath()` refuses absolute,
  protocol-relative and backslash-tricks targets, and the login action re-checks
  with `sanitizeNextPath()`.
- **Restricted accounts** — a localized explanation, never a silent no-op.
- **Feedback** — a polite live region announces saved/removed; failures appear as
  a `role="alert"` toast that auto-dismisses after 7 s and is scoped to the route
  it happened on.
- **Motion** — the card's existing `styles.pop` keyframe is restarted on a real
  unsaved→saved transition only, so a pre-saved product does not animate on load.
  Reduced-motion users get no animation (global `prefers-reduced-motion` rules).
- **No layout shift** — the heart is absolutely positioned over the image; it is
  visible on touch/coarse pointers and on hover/focus for fine pointers, and a
  saved product's heart stays visible (`[data-saved="true"]`) so state is
  discoverable without hovering.

---

## 7. Localization

All strings live under `wishlist.*` in `messages/en.json` and `messages/vi.json`
(21 keys, identical in both files): page title/subtitle, back link, wishlist nav
label, add/saved CTA, `aria-label` templates with `{name}`, remove action, empty
title/description/CTA, load error + contact link, generic/action errors,
sign-in-required, restricted-account, unavailable-product, saved/removed
announcements, and the dismiss label.

`scripts/verify-wishlist.mjs` fails if the two locales drift, if a required key is
missing or empty, if the `{name}` placeholders disappear, or if a `t("…")` key
used by the UI has no catalogue entry.

---

## 8. Applying the migration (manual, out-of-band)

> **`0014` has NOT been run against any database. Do not claim it has.**
> There is no migration runner in this repo; migrations are pasted into the
> Supabase SQL editor by hand.

1. Confirm `0001`–`0013` are applied (they are, on the current production
   project) — `0014` depends on `public.is_active_account()` from `0001` and
   fails loudly if it is missing.
2. Open the Supabase dashboard → SQL editor for the intended project.
3. Paste the entire contents of `supabase/migrations/0014_wishlist.sql` and run
   it once. It is idempotent (`if not exists` / `drop policy if exists`) and
   wrapped in a self-verifying block.
4. Expect `--- Solenne 0014 OK: …`. Any other outcome means the block raised and
   the transaction rolled back — read the message, fix the cause, re-run.
5. Verify from the API: `GET /rest/v1/` with the secret key should now list
   `wishlist_items` in `definitions`.
6. **Never re-run `0013`** (or any earlier migration) as part of this step.

---

## 9. Local verification

```bash
pnpm typecheck          # next typegen && tsc --noEmit
pnpm lint               # 0 errors (3 pre-existing warnings in hooks/use-intersection.ts)
pnpm test:unit          # 81 tests, incl. 27 in tests/unit/wishlist-core.test.ts
pnpm test:verify        # 12 harnesses, incl. verify-wishlist.mjs (114 assertions)
pnpm build
pnpm test:e2e
```

`node scripts/verify-wishlist.mjs` can be run alone. It is entirely static — no
database, no network, no credentials.

Manual checks that need a real account (only possible after `0014` is applied to
the project you are pointed at):

1. Guest: tap a heart on `/products` → redirected to `/login?next=/products`;
   no row is created.
2. Signed in: tap a heart → it fills immediately, a polite announcement fires,
   and reloading shows it still saved.
3. Save the same product twice (double click) → one row, no error.
4. Open the product detail page → the same product reads as saved; removing it
   there also clears it on the catalogue.
5. `/account/wishlist` lists saved products newest-first with image, name and
   price; "Remove" deletes the row and the row disappears.
6. Empty wishlist → the empty state links back to the shop.
7. Vietnamese locale → every string, including the `aria-label` and the toast,
   is translated.
8. Suspend the account (admin) → saves now return the restricted message.

---

## 10. Remaining limitations

- **`0014` is not applied.** Until it is, no wishlist write can succeed. The UI
  degrades honestly (localized failure toast, catalogue unaffected) rather than
  silently pretending to save.
- **No staging database journey test.** The E2E suite requires
  `SOLENNE_E2E_BASE_URL`; the wishlist flow is not in a CI journey. It is covered
  by 27 unit tests (pure rules), 114 static assertions (schema/RLS/action/UI
  contract) and the manual script above.
- **No live RLS test.** No test asserts "customer B cannot read customer A's
  rows" against a real database, because that needs a dedicated non-production
  project. The policies are verified statically; RLS itself is enforced by
  Postgres, not by the harness.
- **The wishlist does not render on the home page.** `FeaturedProducts` has no
  hearts; adding them would put a database read on the landing page.
- **A deactivated product disappears from the list** (filtered by
  `getProductsByIds`) while its row remains until the product is deleted. This is
  intentional — the row is invisible, and the cascade cleans it up on delete.
- **Cross-tab sync is not implemented.** Two open tabs reconcile on reload, not
  live, because the store is per-document and there is no broadcast channel.
- **No "move to cart" affordance.** The wishlist links to the product page; it
  does not add variants to the cart directly.
