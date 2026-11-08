# Order integration tests (migrations 0016 + 0017)

These tests exercise `public.create_order()` against a **fresh disposable PostgreSQL
database**. They are deliberately **not** part of `pnpm test` / CI because they
need a database and, for the concurrency cases, a real multi-session server.

> **Never point this suite at production.** The fixture aborts if
> `public.orders` already contains rows, and the runner refuses a non-local
> host unless `SOLENNE_TEST_DB_ALLOW_REMOTE=1` is explicitly set. Those are
> guard rails, not permission to try it.

## Files

| File | Purpose |
| --- | --- |
| `0016_create_order.fixture.sql` | Bare-Postgres stand-in for the pre-migration schema (`auth` stubs, roles, profiles, products/variants, orders/order_items, addresses) |
| `0016_create_order.seed.sql` | Five identities (customer, second customer, suspended, staff, manager) and a small catalog; run **after** `0001`–`0008` |
| `0016_create_order.tests.sql` | Order creation/security suite: success, pricing, validation, authorization, direct-INSERT denial, rollback, cancellation, last-unit guard |
| `0017_order_status_events.legacy.sql` | One pre-0017 order used to verify the backfill |
| `0017_order_status_events.tests.sql` | Status history suite: initial event, transitions, cancellation, failed transitions, RLS, direct-write denial, staff access, backfill honesty |
| `../../scripts/run-create-order-integration.mjs` | Applies the fixture + migrations + both suites, then runs the two-session concurrency scenarios |

## Run everything (recommended)

Start any disposable PostgreSQL (a throwaway container/local cluster on a
non-production port), create an empty database, then:

```powershell
$env:SOLENNE_TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:55432/solenne_order_test"
# optional when psql is not on PATH:
# $env:SOLENNE_TEST_PSQL = "C:\path\to\psql.exe"
node scripts/run-create-order-integration.mjs
```

The runner:

1. applies the fixture, migrations `0001`, `0002`, `0003`, `0005`, `0006`,
   `0007`, `0008`, `0016`, the legacy order, migration `0017`, and both SQL
   suites;
2. starts two `psql` sessions for “two buyers, one remaining unit” and asserts
   exactly one order and one stock deduction;
3. starts two `psql` sessions with the **same idempotency key/payload** and
   asserts the second returns the first order (`replayed = true`) with a single
   stock deduction.

Exit code `0` means every check passed. Without
`SOLENNE_TEST_DATABASE_URL` the runner prints `[SKIP]` and exits `0`.

## Run only the sequential SQL suite

```powershell
psql -v ON_ERROR_STOP=1 -f supabase/tests/0016_create_order.fixture.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0001_rbac_schema.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0002_rbac_seed.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0003_rbac_rls.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0005_rbac_security_foundation.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0006_cancel_order_atomic.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0007_order_fulfillment_transitions.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0008_cancel_order_outbox_event.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/0016_create_order.seed.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0016_create_order_atomic.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/0017_order_status_events.legacy.sql
psql -v ON_ERROR_STOP=1 -f supabase/migrations/0017_order_status_events.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/0016_create_order.tests.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/0017_order_status_events.tests.sql
```

The suites print one `NOTICE` per passing scenario and end with
`--- Solenne 0016 integration suite: ALL CHECKS PASSED ---` and
`--- Solenne 0017 integration suite: ALL CHECKS PASSED ---`.

## What is covered

| Requirement | Where |
| --- | --- |
| Successful creation, USD pricing, free shipping ≥ $50, discount 0 | test 1 + 12 |
| Items snapshot, stock deduction, `order.created` audit | test 1 |
| Retry returns the original order | sequential test 2 + concurrency “idempotency” |
| Same key + different payload rejected | test 3 |
| Empty cart, duplicate variants, quantities outside 1–99 | test 4 |
| Unknown variant, inactive product, insufficient stock | tests 4–5 |
| Email / address / notes / key validation | test 6 |
| Suspended account, missing permission, anon cannot execute | test 7 |
| Direct authenticated INSERT denied; service_role still works | test 8 |
| Any failure rolls back order, items and stock | test 9 |
| Cancellation + stock restoration + outbox still work | test 10 |
| Last available unit cannot be sold twice | test 11 (sequential) + concurrency “last-stock” |
| Two concurrent buyers, one unit | concurrency “last-stock” |
| Two concurrent identical retries | concurrency “idempotency” |
| Customer ownership isolation on the RPC-created order | test 13 |
| Initial status event on creation | 0017 test 1 |
| Exactly one event per successful transition | 0017 test 2 |
| Cancellation event + stock restoration | 0017 test 3 |
| Failed/unauthorized transitions create no event | 0017 test 4 |
| Customer A cannot read Customer B's events | 0017 test 5 |
| Customers cannot directly modify history | 0017 test 6 |
| Customers cannot read `actor_user_id`/`reason` or call the admin RPC | 0017 test 6 |
| Staff/manager access follows `order.read` and gets the full history | 0017 test 7 |
| Backfill records only the migration-time status | 0017 test 8 |
| Failed creation rolls back its event | 0017 test 9 |

## Notes

- The fixture creates `auth.uid()` and a minimal `auth.users` table because a
  bare PostgreSQL has no Supabase auth schema. Do not run the fixture against a
  real Supabase project.
- The concurrency runner uses a coordination advisory lock so session B starts
  only after session A has created its order and is holding the variant row
  lock. That makes the race deterministic instead of timing-dependent.
- The sequential suite leaves test rows behind in the disposable database; it
  is meant for a throwaway database, not for repeated use of a shared one.
