# Production Readiness — Quality Gate, Testing and Observability

This document describes the automated quality gate added in Phase 1, what it
actually verifies, how to reproduce it locally, and what is still missing. It is
the reference for "is this repository safe to change?" and for future work such
as Wishlist and Verified Product Reviews.

Scope of Phase 1: CI, a testing foundation (unit + E2E), a Cloudflare-native
observability baseline, and this documentation. No application behavior, schema,
RLS policy, RBAC permission or AI prompt was changed.

---

## 1. CI architecture

Workflow: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

### Triggers

| Event | Runs |
| --- | --- |
| `pull_request` targeting `main` | Yes |
| `push` to `main` | Yes |
| `workflow_dispatch` | Yes (manual) |

### Guard rails

| Setting | Value | Why |
| --- | --- | --- |
| `permissions` | `contents: read` | Least privilege; no job writes to the repository, packages or issues. |
| `concurrency` | `ci-<workflow>-<ref>` | A new push to the same PR cancels the outdated run. Pushes to `main` are **not** cancelled, so every commit landing on `main` is verified. |
| `timeout-minutes` | 15 (typecheck, lint), 20 (tests, e2e), 25 (build) | Bounded spend and fast feedback on a hung step. |
| Caching | `pnpm/setup@v3` with `cache: true` | Caches the pnpm store keyed by `pnpm-lock.yaml`. |
| Node | `node@24` | The recommended and CI-tested runtime. Node.js **22.18+** is the documented minimum (native TypeScript type stripping); see §2. |
| pnpm | read from `packageManager` (`pnpm@11.24.0`) | Installer and lockfile version always agree. |
| Install | `pnpm install --frozen-lockfile` | Fails instead of silently rewriting the lockfile. |
| Secrets | **None** | No Supabase, Cloudflare or AI credential is referenced anywhere in the workflow. The E2E job pins Supabase at a closed local port with placeholder values. |

### Jobs (each one is an independent required check)

| Job name | Command | Failure means |
| --- | --- | --- |
| `Typecheck` | `pnpm typecheck` (`next typegen && tsc --noEmit`) | A type error in application code, tests or config. `next typegen` is required because route-type globals (`LayoutProps`, `PageProps`) and `next-env.d.ts` are generated, not committed. |
| `Lint` | `pnpm lint` | ESLint (flat config, `eslint-config-next`) reported an error. |
| `Tests` | `pnpm test:unit` then `pnpm test:verify` | A behavior regression in the unit suite, or a business invariant in a harness. |
| `Build` | `pnpm build` | The production Next.js build (including the deterministic image pipeline) failed. |
| `E2E (public shell)` | `pnpm test:e2e` | One of the five database-free public-shell journeys broke. |

Each job installs dependencies in its own named step, so a failure is
attributable to installation, type checking, linting, tests or build — not to an
opaque aggregate.

### What `pnpm build:worker` does now, and why it is not a CI check yet

`pnpm build:worker` is now just `opennextjs-cloudflare build`. OpenNext invokes
the package's own `build` script internally, so a single run executes:

1. `pnpm build` → `node scripts/generate-optimized-images.mjs && next build`
   (the deterministic AVIF/WebP pipeline **once**, then the Next.js build
   **once**);
2. OpenNext bundling into `.open-next/` (Worker + static assets).

The script used to be
`node scripts/generate-optimized-images.mjs && opennextjs-cloudflare build`,
which generated the images twice and compiled the app twice. That duplication is
gone; `pnpm build` is unchanged and is still the plain Next.js build used by this
gate and by `next start`.

The Worker build is nevertheless **not** the CI Build job today, because it does
not complete on this toolchain (`@opennextjs/cloudflare` 1.20.6,
`@opennextjs/aws` 4.1.4, Next 16.3.3, `sharp` 0.35.4). While bundling the
server, OpenNext runs esbuild over the traced Next.js server and esbuild inlines
`sharp`'s native addon:

```
⚙️ Bundling the OpenNext server...
X [ERROR] No loader is configured for ".node" files:
  node_modules/.pnpm/@img/sharp-<platform>@0.35.4/.../sharp-<platform>-0.35.4.node
X [ERROR] Could not resolve require("../src/build/Release/sharp-*-*.node")
```

(The `@img/sharp-*` path segment is host-specific — `win32-x64` locally,
`linux-x64` on a Linux runner. The second error comes from `sharp`'s own source
build fallback, `require(\`../src/build/Release/sharp-${platform}-${version}.node\`)`
in `sharp/dist/sharp.cjs`, which never exists in a prebuilt install: resolution
fails on the template path as well as on the real `@img` addon.)

#### Verified cause

1. Next.js' own output-file tracing puts `next/dist/server/image-optimizer.js`
   **and 40 `sharp`/`@img` entries** (count measured on win32; the Linux variant
   traces the `linux-x64` packages instead) into `.next/next-server.js.nft.json`
   on every build, including the platform-specific `.node` binary
   (`Select-String -Path .next\next-server.js.nft.json -Pattern sharp`). This is
   tracing only; it happens regardless of application code.
2. `image-optimizer.js` statically contains `try { _sharp = require("sharp") }`.
   The `try/catch` is a runtime guard, not a bundler guard: esbuild resolves the
   `require` at build time.
3. `sharp` **is resolvable from the app root**, because it is both Solenne's own
   devDependency (`node_modules/sharp`, used by
   `scripts/generate-optimized-images.mjs`) and `next`'s `optionalDependencies`
   entry (`^0.35.3`). So esbuild bundles it instead of leaving it unresolved.
4. `@opennextjs/cloudflare`'s `EXCLUDED_PACKAGES` (`sharp`, `@img`) only stops
   those traced files from being **copied** into the bundle; it does not stop
   esbuild from resolving and inlining them. `bundle-server.js` passes only
   `external: ["./middleware/handler.mjs"]`, and its
   `handleOptionalDependencies([...])` list (`caniuse-lite`, `critters`, `jimp`,
   `probe-image-size`, `react-dom/server.edge`) does not include `sharp` — and
   would only substitute a throwing stub for a *missing* package anyway.

This is **not** a credential, binding or environment-variable problem: it happens
after `next build` succeeds, no Cloudflare account is involved, nothing is
uploaded, and it reproduces with `.env.local` removed. It is also **not**
Windows-specific — upstream issue
[opennextjs/opennextjs-cloudflare#1394](https://github.com/opennextjs/opennextjs-cloudflare/issues/1394)
reports the same two errors on Linux with `@opennextjs/cloudflare` 1.20.6 and
Next 16.3.5.

#### Fixes evaluated and rejected

| Candidate | Outcome |
| --- | --- |
| `images.unoptimized: true` (documented Next.js config) | **Tested, ineffective.** A full `next build` with `unoptimized: true` produced an identical trace: 40 `sharp` entries and `image-optimizer.js` still present. It is also not semantically neutral here — `ParallaxImage`, the admin product thumbnails and journal pages use `next/image` without `unoptimized`. Reverted. |
| `outputFileTracingExcludes` / `outputFileTracingIncludes` | Cannot help: tracing controls what is *copied*, while the failure is esbuild *resolving* `sharp` from the app root's `node_modules`. |
| OpenNext configuration | No lever exists. `defineCloudflareConfig()` accepts `incrementalCache`, `tagCache`, `queue`, `cachePurge`, `enableCacheInterception`, `routePreloadingBehavior`; `OpenNextConfig` adds only `edgeExternals` (for compiling `open-next.config.ts` itself). No option stubs or externalizes a server-bundle package. |
| Bumping `@opennextjs/cloudflare` within the 1.20 line | **Ineffective today.** The latest published version is 1.20.13; its tarball was inspected and contains no native-addon stub plugin, the same `optionalDependencies` list and the same `external` array. The upstream fix is PR [#1433](https://github.com/opennextjs/opennextjs-cloudflare/pull/1433) (“stub `.node` native addons instead of failing the server bundle”), still open/unmerged. |
| Patching `node_modules` / OpenNext `dist` | Rejected: not a maintainable or reviewable fix. |
| Removing `sharp` from the root dependency set / moving the generator into a separate workspace package | Rejected for now: conflicts with keeping `sharp` for `scripts/generate-optimized-images.mjs`, is a structural change, and cannot be verified on a Linux runner from this machine. Kept as the fallback if the upstream fix stalls. |

#### Why excluding `sharp` from the Worker is safe for Solenne

`sharp` is **build-time only** here: the only importer in the repository is
`scripts/generate-optimized-images.mjs` (two call sites). Product photography is
served through the pre-generated `<picture>` AVIF/WebP pipeline
(`lib/product-images.ts`, `ProductPicture`), which deliberately bypasses
`/_next/image`; the remaining `next/image` usages point at assets/images and are
not part of the server runtime's sharp path. So a stub of the native addon in
the bundled Worker would not remove any capability Solenne actually uses — which
is exactly what upstream PR #1433 proposes. This is an argument for the eventual
fix, **not** evidence that it has been verified.

#### Diagnostic evidence (not a fix)

With `sharp` temporarily moved out of Node's resolution paths (the `.pnpm` store
entries and the two `sharp` links) and the already-built `.next` reused
(`opennextjs-cloudflare build --skipNextBuild`), OpenNext completed:

```
Worker saved in `.open-next/worker.js` 🚀
OpenNext build complete.
```

That only proves the rest of the pipeline (bundling → `.open-next/worker.js` +
assets) works without any Cloudflare credential. It is not an acceptable
production fix and was reverted; nothing in the repository depends on it.

#### Environment limits on verification

The Worker build needs POSIX symlink support. On this Windows 11 machine
(non-elevated, Developer Mode off) OpenNext fails *earlier*, in
`copyTracedFiles`, with `EPERM: operation not permitted, symlink ...`, because
pnpm dependency links are recreated inside `.open-next/`; OpenNext also prints
`WARN OpenNext is not fully compatible with Windows`. Infrastructure for a
clean Linux run (WSL, Docker, podman, remote runner) is not available on this
machine, and CI cannot be used without pushing. The `sharp` esbuild failure
above was observed locally only through a temporary `copyTracedFiles` diagnostic
patch, which has been reverted.

Consequently the Build gate stays on `pnpm build`, and the Worker build remains
a manual, pre-deploy step that must be run on Linux. The next action is to retry
`pnpm install --frozen-lockfile && pnpm build:worker` on Ubuntu with Node 24 and
pnpm 11.24.0 once an OpenNext release carries the native-addon stub (watch #1394
/ #1433), then confirm: image generation ×1, `next build` ×1, bundling completes,
`.open-next/worker.js` exists, exit code 0, no upload — and only then switch the
CI Build job to `pnpm build:worker`.

`pnpm deploy` / `pnpm upload` need an authenticated Cloudflare account and
remain a manual, out-of-band step. Deployment state is not verified by CI.

### Why the E2E job is limited to the public shell

The five `tests/e2e/public-shell.spec.ts` tests only touch `/about`,
`/journal`, a `/journal/[slug]` post, `/login` and a 404. Each of those renders
with Supabase unreachable, so the job points every Supabase variable at
`http://127.0.0.1:9` (a closed port) with placeholder keys and starts a local
`next dev` on port 3100. That configuration was verified locally: `/products`
returns HTTP 500 (`fetch failed`) instead of production catalogue data.

Catalogue, product detail, login/logout, account, checkout and admin journeys
all need a seeded staging project. **They are not run in CI and are not
claimed to be covered by these five tests.**

### What CI deliberately does not do

- No production credentials, no production database, no test users or orders.
- No staging-dependent E2E journeys (catalogue, account, checkout, admin).
- No `verify-rbac.mjs` (it requires `.env.local` and the live project; `--full`
  writes disposable accounts and an order).
- No `verify-dock-layout.mjs` (requires Puppeteer and a running dev server).
- No deploy or upload to Cloudflare; no Cloudflare credential is used anywhere.
- No `continue-on-error`, no `|| true`, no skipped check presented as passing.

---

## 2. Running the gate locally

```bash
pnpm install --frozen-lockfile

pnpm typecheck              # next typegen && tsc --noEmit
pnpm lint
pnpm test:unit              # node:test, tests/unit/**
pnpm test:verify            # approved static harnesses, via scripts/run-verify.mjs
pnpm build                  # production Next.js build (+ image generation)
pnpm build:worker           # Cloudflare Worker artefact (see §1: currently blocked by sharp)
```

`pnpm test` runs `test:unit` then `test:verify`.

Node.js **22.18+** is the minimum. The unit suite executes `tests/unit/**/*.test.ts`
directly through Node's native TypeScript type stripping, which is enabled by
default from 22.18 (and is still experimental in that line). Node.js **24.x** is
the recommended and CI-tested runtime (`node@24` in the workflow); the repo is
developed on `v24.19.0`. Older 22.x releases need `--experimental-strip-types`,
which the `test:unit` script does not pass.

---

## 3. Verification harness inventory

`scripts/` holds 13 static harnesses. They assert source/SQL invariants (and, for
two of them, optionally probe the live database). They are **not** a unit test
suite, and their presence is not proof that the app behaves correctly at runtime.

### In the CI gate (`pnpm test:verify`, via `scripts/run-verify.mjs`)

| Harness | Scope | Environment needs |
| --- | --- | --- |
| `verify-admin-assistant.mjs` | Role→tool→permission matrix, zod bounds, field allow-lists, prompt budget, route wiring | None |
| `verify-admin-shell.mjs` | Admin shell/route guards, focus rules, pagination wiring, session handling | None |
| `verify-callback-redirect.mjs` | OAuth callback redirect policy | None |
| `verify-cancel-order.mjs` | `cancel_order` RPC contract and action wiring | None |
| `verify-contact-newsletter.mjs` | Contact/newsletter actions, error paths, migration `0013` contents | None (static only) |
| `verify-customer-status.mjs` | Customer status/reinstatement RPC contracts and audit summaries | None |
| `verify-fulfillment-transitions.mjs` | `update_order_status` transitions, tracking code, outbox | None; the live probe runs only if `.env.local` exists and is **read-only** |
| `verify-inventory-adjustment.mjs` | `adjust_inventory_stock` bounds, RPC signature, action wiring | None; the live probe runs only if `.env.local` exists and is **read-only** |
| `verify-post-login-routing.mjs` | Post-login destination policy, open-redirect protection | None |
| `verify-product-management.mjs` | Product/variant validation, delete ordering, no client stock writes | None |
| `verify-search.mjs` | Search normalization, synonyms, ranking, highlight ranges | None |

In CI there is no `.env.local`, so the two optional live probes print an
`[INFO] ... Skipping live DB probe.` line and the harness runs its static
assertions only. This was verified locally by temporarily hiding `.env.local`
(83/83 and 55/55 assertions passed).

### Excluded from the CI gate

| Harness | Reason |
| --- | --- |
| `verify-rbac.mjs` | Requires `.env.local` and the live Supabase project. Its `--full` mode creates and deletes test users and an order — never run it against production. Run it manually against a dedicated test project. |
| `verify-dock-layout.mjs` | Requires Puppeteer plus a running dev server; it renders the admin dock in a real browser. |

---

## 4. Testing strategy

### Unit tests (`tests/unit/`, `pnpm test:unit`)

Runner: **Node.js built-in test runner** (`node:test` + `node:assert/strict`)
with native TypeScript type stripping. No framework was added: Node 24 runs the
real `.ts` modules directly, which keeps the dependency surface at zero for unit
tests and matches the existing `verify-search.mjs` precedent of executing the
actual source.

`allowImportingTsExtensions` was added to `tsconfig.json` so tests can import
`../../lib/...ts` exactly as Node resolves them.

| File | What it actually exercises |
| --- | --- |
| `admin-assistant-proposals.test.ts` | Order cancellation, fulfillment, rollback and inventory preconditions; stock never below zero; 5-minute staleness; proposal warnings/blockers. Mirrors migrations `0006`/`0007`/`0009`. |
| `admin-assistant-drafting.test.ts` | Placeholder detection, reply-language defaulting, intent prompt contents, `mailto:` encoding and truncation budget. |
| `admin-assistant-product-copy.test.ts` | Copy request schema (strict, bilingual rules), description/notes parsing, claim scanning, English-only apply rule. |
| `admin-assistant-request.test.ts` | AI SDK envelope acceptance, strict context schema, tool-argument caps, PostgREST-safe search text, safe history filtering. |
| `search.test.ts` | Accent/case-insensitive normalization (`đ` included), synonym matching, ranking, limits, highlight offsets. |
| `validation-schemas.test.ts` | Order status enum, tracking-code requirement, product/variant schemas, rejection of client-supplied stock. |

54 tests, all behavioral (they call the real functions) — no source-grep
assertions.

### Integration tests — boundary, not yet implemented

Server Actions, authorization guards and RPC boundaries are currently covered
only by static harnesses plus the unit-level precondition logic. A real
integration suite requires:

1. A **dedicated** Supabase test project (never production), with migrations
   `0001`–`0013` applied and the seed from `scripts/seed-products.mjs`.
2. Credentials supplied only to that job (GitHub Environment secrets), never to
   pull requests from forks.
3. A test-only fixture strategy that creates and deletes its own rows, or a
   transactional rollback approach.

Until that environment exists, integration coverage must not be claimed. The
existing harnesses remain the regression net for RPC contracts.

### End-to-end tests (`tests/e2e/`, `pnpm test:e2e`)

Playwright (`@playwright/test` 1.64.1) is the only new dependency added in Phase
1. It is a devDependency and is not installed at runtime. It was chosen because
it is the maintained standard for Next.js App Router E2E, needs no global
service, and can be pointed at a staging URL without touching the app.

Run it only against an explicit target:

```bash
# Staging deployment (preferred)
SOLENNE_E2E_BASE_URL=https://<staging-host> pnpm test:e2e
```

The config **throws** when `SOLENNE_E2E_BASE_URL` is unset, so a missing
environment can never be reported as a green run. Production is not an
acceptable target.

Install the browser once per machine (and once per CI run):

```bash
pnpm exec playwright install chromium
```

Local mode (only database-free public pages are exercised). Two terminals:

```bash
# Terminal 1 - a dev server that cannot reach production Supabase:
$env:NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:9"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="e2e-not-a-real-key"
$env:SUPABASE_SECRET_KEY="e2e-not-a-real-key"
$env:SUPABASE_JWKS_URL="http://127.0.0.1:9/.well-known/jwks.json"
pnpm dev -- -p 3100

# Terminal 2:
$env:SOLENNE_E2E_BASE_URL="http://localhost:3100"
pnpm test:e2e
```

Or let Playwright manage the server (`SOLENNE_E2E_START_SERVER=1`, loopback base
URLs only) — this is the exact path CI uses:

```bash
$env:NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:9"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="e2e-not-a-real-key"
$env:SUPABASE_SECRET_KEY="e2e-not-a-real-key"
$env:SUPABASE_JWKS_URL="http://127.0.0.1:9/.well-known/jwks.json"
$env:SOLENNE_E2E_BASE_URL="http://localhost:3100"
$env:SOLENNE_E2E_START_SERVER="1"
pnpm test:e2e
```

Shell environment variables take precedence over `.env.local`, so those
overrides win. Isolation was verified: with this configuration `/products`
returns HTTP 500 (`fetch failed`) instead of loading production products.

The browser talks to `http://localhost:<port>` because Next 16 rejects
`127.0.0.1` for dev assets; the readiness probe uses the loopback literal
instead.

Current coverage (5 tests, all passing, and run in PR CI):

- `/about` renders its heading inside the site chrome (footer + nav links).
- `/journal` lists posts and a post link opens the article.
- `/login` renders the sign-in form (email, password, submit).
- The locale toggle reloads into Vietnamese (`html[lang="vi"]`), keeps the URL,
  and swaps the copy.
- An unknown path returns HTTP 404.

Not covered yet — requires a seeded staging environment:

- Product catalogue and product detail (Supabase-backed).
- Search palette results (Supabase-backed `/api/search`).
- Login/logout, account pages, order history, checkout validation.
- Admin access control for unauthorized vs. authorized roles.
- Wishlist/Reviews flows (not implemented in the app).

**Only this public-shell suite runs in PR CI** (`E2E (public shell)` job). It
starts `next dev` on port 3100 with Supabase pinned to a closed port and
placeholder keys, installs Chromium via
`pnpm exec playwright install --with-deps chromium`, and fails on any test
failure. The staging-dependent journeys above still have no CI job: they need a
seeded Supabase project and GitHub Environment secrets, and a skipped run is
never counted as a pass.

---

## 5. Observability

### Cloudflare configuration (`wrangler.jsonc`)

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1,
  "redact_query_string": true,
  "logs": { "enabled": true, "invocation_logs": true, "head_sampling_rate": 1 },
  "traces": { "enabled": true, "head_sampling_rate": 0.1 }
},
"upload_source_maps": true
```

- Workers Logs at 100% sampling: traffic is low, and full logs are what make an
  incident debuggable. Query strings are redacted because search routes carry
  user terms.
- Traces at 10% sampling: enough for a usable p50/p95 sample without unbounded
  trace volume/cost.
- `upload_source_maps` keeps Worker stack traces readable.
- No binding was added, changed or removed. This is Cloudflare-native, no
  third-party service and no extra subscription.

Config validity was checked by running `pnpm cf-typegen` (Wrangler parsed the
file successfully); the regenerated `cloudflare-env.d.ts` was unchanged.

### Structured application logging (`lib/observability/log.ts`)

One JSON object per line, emitted with `console.log`/`warn`/`error`, which is
what Workers Logs ingests.

Allowed fields (everything else is dropped by an allow-list): `event`, `route`,
`operation`, `status`, `durationMs`, `requestId`, `actorId`, `actorRole`,
`outcome`, `errorClass`, `errorName`. Values are truncated and control
characters stripped, so one log can never be split or forged.

`requestId` prefers the Cloudflare `cf-ray` header, so a line can be correlated
with the Cloudflare request record; it falls back to a random UUID locally.

Instrumented today:

| Route | Events |
| --- | --- |
| `app/api/chat` | `chat.rate_limited`, `chat.conversation_too_long`, `chat.request_failed` |
| `app/api/admin-assistant` | `admin_assistant.authorization_failed`, `admin_assistant.rate_limited`, `admin_assistant.stream_failed`, `admin_assistant.request_failed` |

`classifyError()` maps a thrown value to `auth` / `validation` / `rate_limited` /
`timeout` / `upstream` / `unclassified` plus the constructor name. Error
messages, request bodies and provider payloads are never logged.

**Never logged:** passwords, access/refresh tokens, Supabase secret keys,
payment credentials, emails, addresses, full conversation contents, tool
arguments or request bodies.

### Metrics: available vs. gaps

| Signal | Status |
| --- | --- |
| Worker errors / unexpected 5xx | **Available** — Workers Logs invocation logs + the `*.request_failed` events. |
| Request duration / TTFB per route | **Available** — Workers traces (10% sample) and logged `durationMs` on failure paths. |
| Admin route p50/p95 latency | **Partial** — derivable from sampled traces; no dedicated dashboard yet. |
| AI request failures | **Available** — `chat.request_failed`, `admin_assistant.request_failed`, `admin_assistant.stream_failed`. |
| AI rate-limit responses | **Available** — `chat.rate_limited`, `admin_assistant.rate_limited`. |
| AI stream failures | **Available** — `admin_assistant.stream_failed` via the stream `onError`. |
| AI token usage | **Gap** — Workers AI usage is not captured by the current streaming setup. |
| Storefront LCP / INP / CLS (field data) | **Gap** — no RUM/Web Vitals reporting is configured. |
| Cold vs. warm request behaviour | **Gap** — no comparison is produced; only raw per-request timing exists. |
| Deployment health checks | **Gap** — no synthetic probe; deploy state is not verified in CI. |

No benchmark numbers are claimed in this document. Anything listed as a gap must
be measured before it is reported.

---

## 6. Security review of this phase

- No migration was added or modified; `0001`–`0013` are untouched.
- No RLS policy, RBAC role, permission or `SECURITY DEFINER` function changed.
- CI references **no** secret; PR checks cannot reach any Supabase or Cloudflare
  project. `verify-rbac` and every data-writing script stay out of CI.
- E2E requires an explicit non-production target. The CI job and local mode
  both point Supabase at a closed local port, which was verified to break
  DB-backed routes; only the five database-free public pages are exercised.
- Logging is allow-listed and excludes PII, tokens, secrets and conversation
  content.
- `order_items`' restrictive RLS policy and the existing admin-client write path
  were left exactly as they were.

---

## 7. Known limitations and remaining work

1. **Staging environment for E2E** — needed to cover catalogue, account,
   checkout and admin journeys. Until then those journeys have no browser test.
2. **Integration tests** — require a dedicated Supabase test project; see §4.
3. **Staging-dependent E2E** — the public shell runs in CI, but catalogue,
   account, checkout and admin journeys need a seeded staging project. When it
   exists, add a job that only runs on `workflow_dispatch` or a manually
   approved environment, using GitHub Environment secrets.
4. **Cloudflare Worker build** — `pnpm build:worker` is verified to produce
   `.open-next/worker.js` without any Cloudflare credential, but it currently
   fails as a single command because esbuild inlines `sharp`'s native addon
   (verified cause and rejected fixes in §1). The fix is upstream (OpenNext PR
   #1433, not yet released) and has to be confirmed on a Linux runner, which is
   not available on the current machine. Until then it is not a CI check and
   `deploy`/`upload` stay manual. Deployment health is still unverified.
5. **Web Vitals / RUM** — no field data for LCP, INP or CLS.
6. **AI token usage** — not measured.
7. **Server Actions / auth guards** — covered by static harnesses and unit-level
   rules, not by executed integration tests.
