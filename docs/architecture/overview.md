# Solenne Architecture Overview

This document describes the architecture implemented in the repository. It is intended for engineers reviewing the codebase, preparing a technical walkthrough, or operating a separate development/staging environment.

## 1. System context

Solenne is a bilingual commerce and store-operations application for an artisan candle brand. It contains three distinct product surfaces:

1. A public storefront and customer account experience.
2. A permission-protected administration dashboard.
3. Two AI assistants with different audiences and security boundaries: the customer-facing Scent Concierge and the internal Admin Assistant.

The application is built with Next.js 16 App Router and React 19, uses Supabase Auth and PostgreSQL for identity and data, and is configured for OpenNext on Cloudflare Workers.

~~~mermaid
flowchart TB
    Visitor[Customer browser] --> Edge[Cloudflare Worker / OpenNext]
    Operator[Staff or manager browser] --> Edge
    Edge --> Next[Next.js 16 App Router]
    Next --> RSC[Server Components]
    Next --> Actions[Server Actions]
    Next --> CustomerAI[POST /api/chat]
    Next --> AdminAI[POST /api/admin-assistant]
    RSC --> Supabase[Supabase Auth + PostgreSQL]
    Actions --> Supabase
    CustomerAI --> Catalogue[Live product catalogue + policy context]
    CustomerAI --> PublicLimit[Per-IP rate limiter]
    AdminAI --> AuthGate[Active actor + management permissions]
    AuthGate --> Tools[Permission-filtered tools]
    Tools --> Supabase
    AdminAI --> AdminLimit[Per-user rate limiter]
    Catalogue --> WorkersAI[Cloudflare Workers AI]
    PublicLimit --> WorkersAI
    Tools --> WorkersAI
    AdminLimit --> WorkersAI
    Supabase --> DBGuard[PostgreSQL RLS + grants + RPCs]
~~~

## 2. Runtime boundaries

### Next.js application layer

| Boundary | Responsibility | Main code locations |
| --- | --- | --- |
| Server Components | Render pages and read the data needed for the current route | app route segments, lib data-access modules |
| Server Actions | Validate and authorize user-initiated mutations | app/actions, lib/validations |
| Customer AI Route Handler | Bound and stream product/policy conversations | app/api/chat/route.ts, lib/assistant |
| Admin AI Route Handler | Authorize an operator, construct permitted tools, and stream tool-assisted responses | app/api/admin-assistant/route.ts, lib/admin-assistant |
| Request proxy | Refresh Supabase session cookies and apply protected-route redirects | proxy.ts, lib/supabase/middleware.ts |

The browser is not the source of truth for identity, price, role, permission, or stock. Client state supports the user experience; trusted business decisions are rechecked on the server and, for critical operations, in PostgreSQL.

### Request proxy and session lifecycle

Next.js 16 uses the root proxy convention in **proxy.ts**. The exported proxy delegates to **updateSession()** in **lib/supabase/middleware.ts**.

The request-side session logic:

- Uses an anonymous fast path when the request has no Supabase auth cookie. Public pages avoid an unnecessary remote Auth lookup.
- Redirects unauthenticated requests for protected route hierarchies such as /admin, /account, and /checkout to the login route while preserving a sanitized destination.
- When an auth cookie exists, creates a Supabase SSR client, calls Auth getUser() to verify/refresh the session, and forwards cookie updates.
- Uses the database-backed current_actor() RPC when resolving the post-login destination for an already-authenticated user.

The proxy is a route/session boundary, not the only authorization control. Protected layouts, server actions, data-access helpers, RLS, and database functions enforce their own requirements.

## 3. Authentication and authorization

### Database-backed actor context

The database is the source of truth for the actor's role, account status, and permission set. The authorization model contains four roles:

- customer
- staff
- manager
- admin

Roles map to explicit permission keys such as order.read, order.update, inventory.read, inventory.update, customer.read, staff.manage, and order.create. Application checks are permission-based rather than relying on a hard-coded role-name hierarchy.

The server-side flow in **lib/authz.ts** resolves the verified Supabase user and calls **public.current_actor()** through the user-scoped session client. It checks that the actor returned by the RPC matches the verified Auth user. A missing authorization RPC or unresolved actor does not produce a permissive fallback; the protected operation fails closed.

The principal guards are:

| Guard | Meaning |
| --- | --- |
| requireActiveActor() | Requires a verified session and an active account |
| requirePermission(key) | Requires an active actor with the named permission |
| requireAnyPermission(keys) | Requires at least one permission from the supplied set |
| requireOwnership(userId) | Requires the active actor to own the resource |
| requireOwnershipOrPermission(userId, key) | Allows the owner or an authorized operator |

### Defense in depth

Authorization is enforced at multiple boundaries:

1. **Application layer:** layouts, Server Actions, data-access helpers, and AI tools check the active actor and required permissions.
2. **PostgreSQL RLS and grants:** the Data API independently scopes readable and writable rows and columns.
3. **Database functions:** critical SECURITY DEFINER RPCs derive the caller from auth.uid(), validate the requested transition, and enforce permissions inside the transaction.

Navigation visibility is a user-experience aid only; it is not treated as an authorization decision.

The security foundation also closes direct profile creation and customer-authored audit-log insertion paths. Audit history is designed as an append-oriented record rather than a customer-editable table.

## 4. Commerce and data-integrity flows

### 4.1 Atomic order creation

The order-creation path is deliberately narrow:

~~~mermaid
sequenceDiagram
    participant Browser
    participant Action as createOrderAction
    participant App as lib/orders.ts
    participant DB as PostgreSQL create_order()
    Browser->>Action: Checkout payload + idempotency key
    Action->>Action: Check order.create + validate checkout schema
    Action->>App: createOrder(validated data)
    App->>App: Re-check owner + order.create
    App->>DB: One RPC call
    DB->>DB: Derive actor from auth.uid()
    DB->>DB: Lock variants and re-read price/stock
    DB->>DB: Write order + items + stock decrement + audit event
    DB-->>App: Order result
    App-->>Action: Mapped order
    Action-->>Browser: Success or structured error
~~~

The application path is implemented in **app/actions/orders.ts** and **lib/orders.ts**. The database boundary is **public.create_order()** in migration **0016_create_order_atomic.sql**.

Important invariants:

- The database derives the customer identity from auth.uid(). The RPC does not accept a client-supplied user ID, price, or order total.
- The caller supplies variant identifiers and quantities plus delivery details. The function re-reads eligible product/variant data and recalculates prices from database state.
- Variant rows are locked FOR UPDATE in deterministic order before stock is checked and decremented. This protects concurrent checkouts from overselling the same stock.
- Order header, line items, stock deductions, and the order-created audit record are committed in one PostgreSQL transaction. A failure rolls back the entire operation.
- Direct INSERT privileges on orders and order_items are revoked from anon/authenticated clients; the trusted creation RPC is the intended customer write path.

### 4.2 Checkout idempotency

A network timeout can leave the browser uncertain whether an order was created. Retrying with a new request must not create a duplicate.

The client helper in **lib/checkout-idempotency.ts** builds a stable signature from normalized email, shipping address, cart lines, and notes. It reuses the same key while that payload remains unchanged, persists the pending key in sessionStorage where available, and rotates the key when the order payload changes.

The database is the enforcement point:

- A partial unique index covers (user_id, checkout_idempotency_key).
- A canonical payload hash is stored with the key.
- The same user/key and same payload returns the original order result.
- Reusing the same key with a different payload is rejected.
- The unique index, rather than browser state, arbitrates concurrent submissions.

This is an at-least-once request/retry environment made safe through a database-enforced idempotency contract; it does not rely on disabling the checkout button.

### 4.3 Append-only order status history

Migration **0017_order_status_events.sql** introduces **public.order_status_events** as the durable history for an order.

- Creation, fulfillment transitions, and cancellation write the corresponding event in the same transaction as the order mutation.
- A rejected transition leaves neither a status change nor a history row.
- Existing orders are backfilled with only the status known when the migration runs. The event is marked as backfill and has no from_status; earlier events are not invented.
- Normal authenticated users receive column-level SELECT access only to the fields needed for their own timeline.
- Internal actor and reason fields are not part of the customer SELECT grant. The management timeline calls get_order_status_events_admin(), which checks order.read before returning the full event data.
- There are no authenticated/anonymous INSERT, UPDATE, or DELETE policies/grants for this event history.

Customer and management timelines use separate read paths because their data visibility requirements are different.

### 4.4 Inventory and audit operations

Inventory adjustments are handled by the **adjust_inventory_stock()** database function from migration **0009_inventory_adjust_atomic.sql**. It derives the actor from auth.uid(), checks inventory.update, validates the adjustment and reason, prevents negative stock, and writes the audit event in the same transaction as the stock change.

Order cancellation and fulfillment transitions similarly use database functions as the trusted state-transition boundary. Their application callers do not replace the database checks.

## 5. The two AI architectures

Solenne intentionally does not treat every AI use case as one general-purpose chatbot. The customer assistant and the admin assistant have separate routes, context, permissions, and capabilities.

### 5.1 Customer Scent Concierge

**Route:** app/api/chat/route.ts  
**Prompt/context:** lib/assistant/context.ts  
**UI:** components/assistant/chat-widget.tsx

~~~mermaid
sequenceDiagram
    participant Customer
    participant Widget as Chat Widget
    participant Route as POST /api/chat
    participant Data as Product data layer
    participant AI as Workers AI
    Customer->>Widget: Ask about scent or policy
    Widget->>Route: Recent messages + locale
    Route->>Route: Validate JSON, message array, history and text budget
    Route->>Route: Apply per-IP rate limit
    Route->>Data: getProducts()
    Data-->>Route: Current catalogue
    Route->>AI: System prompt + policy + catalogue + recent messages
    AI-->>Widget: Streamed response
~~~

The prompt builder uses the storefront product data layer to include current product names, scent notes, variants, prices, stock availability, and burn-time information, together with bilingual store-policy context. If catalogue loading fails, the assistant switches to a safe no-quote context rather than inventing price or availability.

Current customer-assistant bounds in the code:

| Control | Current value |
| --- | --- |
| Model | @cf/meta/llama-3.3-70b-instruct-fp8-fast |
| Conversation history | Latest 12 messages |
| Combined text input budget | 4,000 characters |
| Maximum output | 400 tokens |
| Rate limit | 10 requests / 60 seconds per client IP key |

**Architecture classification:** this is live catalogue grounding by directly loading product data into the prompt. It is not vector search or a RAG pipeline: the repository does not use an embedding index or vector database for this assistant.

The customer assistant cannot read customer accounts or orders, track or modify an order, accept payment, or execute a purchase. Conversation history is held in client memory and is not persisted. Request validation currently checks JSON shape, a non-empty messages array, history length, and text size; it does not apply a complete Zod schema to every message.

### 5.2 Permission-scoped Admin Assistant

**Route:** app/api/admin-assistant/route.ts  
**Tool access:** lib/admin-assistant/access.ts and tools.ts  
**Read operations:** lib/admin-assistant/reads.ts  
**Proposals:** lib/admin-assistant/proposals.ts  
**Drafting:** lib/admin-assistant/drafting.ts

The Admin Assistant is an operational interface for authorized staff, managers, and administrators. It is not exposed to customer sessions.

Request flow:

1. Reject cross-origin requests using the same-origin check.
2. Resolve an active authenticated actor and require at least one management permission.
3. Validate the request with the admin-assistant Zod request schema and enforce bounded conversation history/input.
4. Apply a per-user Cloudflare rate limit (configured as 20 requests per 60 seconds).
5. Build the tool list for the current actor's actual permission set and construct a prompt containing only those tools.
6. Stream the model response and tool results through the Vercel AI SDK.

The tool catalogue includes bounded operations such as order summary/list/search/detail, low-stock and variant-stock reads, customer search, dashboard counts, customer-email drafting, and proposals for cancellation, fulfillment transitions, and inventory adjustments.

Security properties:

- Tools are filtered by permission before they are exposed to the model.
- Every tool execution rechecks its permission; the filtered list is not the authorization boundary.
- Read helpers call requirePermission() themselves and use the user-scoped Supabase client, with explicit column selections and result caps.
- The assistant does not expose aggregate revenue because that metric is not present in the corresponding admin dashboard surface.
- Drafting returns text only. It does not send, schedule, or persist an email.
- Proposal tools return a structured proposal card; they do not write to the database or call a mutation RPC.
- A human operator confirms the proposal through the existing admin UI. The existing Server Action, permission guard, database RPC, validation, and audit path remain the trusted write boundary.

This separation keeps the model in the planning and explanation loop while business mutations stay in deterministic application/database code.

### 5.3 Model stream compatibility

The configured Workers AI model/provider combination has emitted duplicate text deltas and duplicated tool-input deltas. The repository handles these at different layers because the AI SDK assembles tool calls before a normal streamText transform can inspect their raw tool-input chunks.

- Text deltas are normalized at the streamText transform boundary.
- Tool-input deltas are normalized at the language-model middleware boundary before the SDK assembles the tool call.
- The pairing logic uses look-ahead detection rather than deleting every adjacent repeated chunk, because genuine repeated characters and numeric tokens must be preserved.

This is a provider-compatibility workaround, not an application-level conversational feature.

## 6. Rendering, state, and performance boundaries

- Server Components remain the default for route/page data and static content.
- Client Components own browser interactions such as cart state, chat state, locale controls, and slideshow navigation.
- Server Actions and Route Handlers form separate request boundaries for mutations and AI streaming.
- React cache() is used for request-scoped deduplication of Supabase client/session and actor lookups. It is not a cross-request user or permission cache.
- GSAP and Lenis lifecycles are explicitly managed; visibility-aware behavior is used for expensive visual sections.
- Product imagery has build-time AVIF/WebP variants. The homepage hero uses a separate five-image WebP slideshow with a first-slide priority strategy and deferred mounting of the remaining posters after the page load event.

The repository does not currently publish a repeatable Lighthouse/Web Vitals benchmark. No LCP, INP, CLS, TTFB score, or percentage improvement is claimed in this document.

## 7. CI, verification, and known gaps

The GitHub Actions workflow in **.github/workflows/ci.yml** runs five jobs for pull requests to main:

| Job | What it checks |
| --- | --- |
| Typecheck | Next.js type generation followed by TypeScript checking |
| Lint | ESLint |
| Tests | Node built-in unit tests and the approved static verification harnesses |
| Build | Optimized image generation and a production Next.js build |
| E2E (public shell) | Five database-free Playwright journeys: about, journal, a journal post, login, and a 404 |

The static verification runner currently registers 15 deterministic harnesses under scripts/. The CI environment contains no production Supabase or Cloudflare secrets.

Important boundaries:

- Database-backed E2E journeys for catalogue, accounts, checkout, and admin require a seeded staging environment and are not covered by the five public-shell CI tests.
- Database-aware verification scripts are manual and may need a dedicated non-production project. Never run data-writing verification modes against production.
- The normal CI Build job runs pnpm build (Next.js production build). The separate OpenNext Worker build is not a required check because the current toolchain has a known esbuild/Sharp native .node bundling failure documented in docs/quality/production-readiness.md.
- A green CI run proves the checks above passed. It does not prove that every authenticated journey was executed, that the OpenNext Worker artifact built, or that a specific commit has been deployed.

See **docs/quality/production-readiness.md** for the detailed test matrix and reproducible commands.

## 8. Deployment model

The application is configured for OpenNext on Cloudflare Workers.

Key pieces:

- **open-next.config.ts** configures the Cloudflare adapter.
- **wrangler.jsonc** defines the Worker, static asset binding, Workers AI binding, rate limiters, and service binding.
- **worker.js** wraps the generated OpenNext Worker.
- **package.json** provides build, preview, deploy, and upload scripts.

The repository includes a Cloudflare-hosted demo URL, but the presence of deployment configuration or a GitHub merge alone is not proof of the current production deployment. Confirm the deployed commit and runtime health in the Cloudflare dashboard when operational verification is required.

## 9. Environment and operational notes

- Use Node.js 24.x for the CI-matched development environment. Node.js 22.18 is the repository's minimum for running the native TypeScript unit-test command.
- pnpm is pinned to 11.24.0 in package.json.
- Install from the committed lockfile with pnpm install --frozen-lockfile.
- Configure Supabase publishable URL/key in local environment. Keep the Supabase secret key server-side and never expose it through a NEXT_PUBLIC_ variable.
- Read supabase/README.md before applying database migrations. The one-time admin bootstrap SQL is an operator step, not a routine migration.
- The local Next.js server does not provide Cloudflare runtime bindings by itself. Validate Workers AI and Cloudflare rate-limit behavior through the documented Cloudflare preview workflow.
- The Stripe package is present, but payment-session creation, payment confirmation, webhook processing, and reconciliation are not implemented.

## 10. Source map

| Concern | Main locations |
| --- | --- |
| Route/session proxy | proxy.ts, lib/supabase/middleware.ts |
| Supabase clients and request session | lib/supabase/client.ts, server.ts, session.ts |
| Authorization | lib/authz.ts, lib/redirect.ts |
| Customer checkout and orders | app/actions/orders.ts, lib/orders.ts, lib/checkout-idempotency.ts |
| Order database boundary | supabase/migrations/0016_create_order_atomic.sql |
| Order status history | supabase/migrations/0017_order_status_events.sql, lib/order-status-events-core.ts |
| Inventory adjustments | supabase/migrations/0009_inventory_adjust_atomic.sql |
| Customer Scent Concierge | app/api/chat/route.ts, lib/assistant/context.ts, components/assistant |
| Admin Assistant | app/api/admin-assistant/route.ts, lib/admin-assistant |
| Admin pages | app/admin, components/admin, lib/admin-*.ts |
| CI and quality gate | .github/workflows/ci.yml, docs/quality/production-readiness.md |

## Related documentation

- [Technical case study](../case-studies/solenne-technical-case-study.md)
- [Production readiness and CI coverage](../quality/production-readiness.md)
- [Database and RBAC runbook](../../supabase/README.md)
