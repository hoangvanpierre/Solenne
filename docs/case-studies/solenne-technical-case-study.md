# Solenne — Technical Case Study

## Executive summary

Solenne is a full-stack commerce and store-operations application built for an artisan candle brand. The project combines a bilingual storefront, customer accounts and checkout, a permission-protected administration dashboard, PostgreSQL-backed business workflows, and two AI assistants with separate security boundaries.

The engineering focus is not only feature breadth. The project addresses transaction integrity, retry safety, database-enforced authorization, auditable state transitions, bounded AI access, and a repeatable quality gate.

**Project role:** Independent project author, responsible for the application and its end-to-end technical implementation.

**Core stack:** Next.js 16, React 19, TypeScript, Supabase PostgreSQL/Auth, Cloudflare Workers AI, Vercel AI SDK, OpenNext, Cloudflare Workers, and GitHub Actions.

**Live demo:** https://solenne.dangvohoangvan.workers.dev/  
**Repository:** https://github.com/hoangvanpierre/Solenne

## 1. Product and engineering problem

The project needed to support two different operating environments:

- Customers need to discover products, understand scent profiles, manage their account, and submit orders through a bilingual storefront.
- Store operators need to manage products, variants, stock, orders, customers, reviews, and audit history without exposing operational data or write capabilities to ordinary customers.

Those surfaces create engineering requirements beyond standard CRUD:

- Checkout must remain correct under retries and concurrent stock changes.
- Customers must not be able to forge prices, totals, ownership, or operational status.
- Staff capabilities must depend on explicit permissions, not client-side UI state.
- A status change must leave a consistent, reviewable history.
- AI features must use different data boundaries for customers and internal operators.
- Automated tests must be useful without depending on production credentials or writing production data.

## 2. System design at a glance

The Next.js App Router acts as the application boundary. Server Components read route data; Server Actions process validated business mutations; Route Handlers provide customer and admin AI streaming endpoints. Supabase provides authentication and PostgreSQL. Cloudflare Workers AI provides model inference, with OpenNext configuring the Worker deployment.

~~~mermaid
flowchart TB
    Customer[Customer] --> Storefront[Next.js storefront]
    Operator[Authorized operator] --> Admin[Next.js admin]
    Storefront --> Auth[Supabase Auth]
    Admin --> Auth
    Storefront --> Commerce[Server Actions + data layer]
    Admin --> Operations[Server Actions + data layer]
    Commerce --> DB[PostgreSQL: RLS, grants and RPCs]
    Operations --> DB
    Storefront --> Concierge[Customer Scent Concierge]
    Admin --> AdminAI[Permission-scoped Admin Assistant]
    Concierge --> ProductContext[Live catalogue + policy prompt]
    AdminAI --> ToolGate[Permission-filtered tools]
    ProductContext --> Model[Cloudflare Workers AI]
    ToolGate --> Model
    Concierge --> Model
~~~

See [Architecture Overview](../architecture/overview.md) for request boundaries, detailed sequence diagrams, authorization and deployment notes.

## 3. Engineering challenge: making checkout atomic and retry-safe

### The problem

A multi-step order path can leave partial state if one operation succeeds and a later step fails. A client retry after a timeout can also create a duplicate order if the server cannot distinguish a replay from a new purchase.

There is a second trust problem: prices and totals sent by the browser cannot be treated as authoritative. A malicious or outdated client must not be able to submit a forged total or create order rows directly through the Data API.

### Design

The application validates checkout input and checks order.create before entering the order data layer. The data layer rechecks ownership and permission, then calls one database function: public.create_order().

Migration 0016 defines that trusted boundary. The database function:

1. Derives the actor from auth.uid() rather than accepting a customer ID.
2. Accepts variant IDs and quantities, not client-supplied prices or totals.
3. Re-reads product/variant eligibility, prices, and stock from PostgreSQL.
4. Locks relevant variant rows FOR UPDATE in deterministic order before checking and decrementing stock.
5. Writes the order, line items, stock deductions, and order-created audit row in one transaction.
6. Uses a unique per-user idempotency key and canonical payload hash to distinguish a valid replay from key reuse with changed order data.

Direct INSERT grants on orders and order_items are revoked from anon/authenticated clients. The intended order-creation path is the authenticated RPC.

### Client retry behavior

The client helper creates a stable signature from the normalized checkout payload. It reuses a key for a retry of the same payload, keeps pending retry state in sessionStorage where available, and rotates the key when material order details change.

The UI helps retries behave consistently, but the unique database index is the enforcement point. A browser-side lock or disabled submit button would not provide the same guarantee under concurrent requests.

### Engineering trade-off

The RPC is more complex than several independent Supabase inserts, but it places pricing, inventory locking, stock mutation, order writes, and audit creation inside one transaction. This is the appropriate boundary for a business operation whose partial completion would be incorrect.

## 4. Engineering challenge: permissions that survive beyond the UI

### The problem

Hiding an admin link or checking a role in a React component does not protect a database row. A caller can bypass the UI and attempt to call a server action or the Supabase Data API directly.

### Design

Solenne uses four database roles—customer, staff, manager, and admin—mapped to explicit permission keys. The application resolves the current actor from a verified Supabase session and a database-backed current_actor() RPC.

The application guard layer provides active-account, permission, and ownership checks. PostgreSQL RLS and grants independently scope data access. Critical SECURITY DEFINER functions derive the caller from auth.uid() and re-check the permission inside the database boundary.

The model avoids trusting client-supplied user IDs, role strings, or navigation visibility as proof of authority.

### Example: order status history

Migration 0017 adds an append-only order_status_events table. The trusted order creation, fulfillment, and cancellation functions write the corresponding event in the same transaction as the order change.

Customer timelines read only the fields granted for their own order. Actor identity and internal reason fields are not included in the normal authenticated SELECT grant. Management timelines retrieve full event details through get_order_status_events_admin(), which enforces order.read.

The migration backfills only the status known at migration time. It does not fabricate historical transitions that were never recorded.

### Resulting invariant

The order row and its audit/history event cannot intentionally diverge through the normal trusted state-transition functions: both are committed or rolled back together.

## 5. Engineering challenge: two AI assistants, two trust boundaries

### 5.1 Customer Scent Concierge

The customer assistant is a bilingual shopping guide. It loads live catalogue details through the storefront data layer and adds them to a policy-guided prompt before streaming a response through Workers AI and the Vercel AI SDK.

Current request bounds include:

- Latest 12 conversation messages.
- 4,000 combined input text characters.
- 400 output tokens.
- 10 requests per 60 seconds per client IP key.
- A safe no-quote fallback when catalogue data cannot be loaded.

The assistant can discuss listed products, scent notes, availability and store policy. It cannot inspect customer accounts, read or change orders, accept payment, or place purchases. Conversation history is held in client memory and is not persisted.

**Important distinction:** this is catalogue grounding by direct data loading, not RAG. The implementation does not use embeddings, a vector database, or semantic retrieval over a document corpus. Describing it as a RAG system would overstate what the code does.

### 5.2 Permission-scoped Admin Assistant

The admin assistant solves a different problem: helping an authorized operator inspect bounded operational data and prepare a proposed action without allowing the model to become the privileged write path.

The request route checks same-origin behavior, resolves an active actor, requires a management permission, validates the conversation schema, applies input/history limits, and uses a per-user rate limiter.

The tool registry is built from the actor's permission set. Tool execution rechecks permissions, and read helpers use a user-scoped Supabase client with explicit column selections and result caps.

Capabilities include order summaries and search, order detail, inventory/low-stock reads, customer lookup, dashboard counts, email drafting, and proposals for cancellation, fulfillment transitions, and inventory adjustments.

The key boundary is the difference between a proposal and a mutation:

- Read tools return bounded operational facts.
- The email drafting tool returns text only; it does not send or schedule email.
- Proposal tools return structured data for the operator to review; they do not call mutation RPCs.
- The operator confirms through the existing admin UI.
- The existing Server Action, permission checks, database RPC, validation, and audit mechanism perform the actual write.

This design uses AI for explanation, navigation, and proposal generation while keeping state-changing operations in deterministic application and database code.

### 5.3 A provider-stream compatibility issue

The configured Workers AI model/provider combination emitted duplicate text deltas and duplicated tool-input deltas. A simple “drop the previous chunk if it looks the same” rule could corrupt legitimate repeated characters or numeric values.

The implementation therefore uses look-ahead pairing logic. Text is normalized at the streamText transform boundary; tool-input deltas are normalized lower, at the language-model middleware boundary, before the SDK assembles a tool call. The pairing logic only collapses a duplicated run after detecting repeated pairs and otherwise preserves the original chunks.

This is a useful example of handling a model/provider integration issue at the correct streaming layer rather than hiding it with fragile output cleanup.

## 6. Quality engineering and verification

The repository includes a required GitHub Actions quality gate with five jobs:

| Job | Scope |
| --- | --- |
| Typecheck | Next type generation and TypeScript checks |
| Lint | ESLint |
| Tests | Node built-in unit tests and 15 deterministic verification harnesses |
| Build | Optimized product image generation and Next.js production build |
| E2E (public shell) | Five database-free Playwright journeys for public routes |

The verification runner checks contracts including admin assistant permissions, admin shell, redirects, order cancellation, contact/newsletter persistence, atomic order creation, customer status, fulfillment transitions, inventory adjustment, product management, reviews, order status events, search, and wishlist.

The CI jobs run without production Supabase or Cloudflare credentials. This reduces the risk of accidentally writing production data during an ordinary pull request.

### What this quality gate does not prove

- It does not run catalogue, authenticated account, checkout, or admin browser journeys. Those require a seeded staging database.
- It does not run data-writing RBAC verification against production.
- It does not currently build the OpenNext Cloudflare Worker artifact. The separate Worker build has a known esbuild/Sharp native .node bundling problem documented in the quality guide.
- It does not provide a measured Lighthouse or Web Vitals score.

A green CI run means the configured checks passed. It should not be presented as proof that every authenticated user journey or the Worker build was tested.

## 7. Design decisions and trade-offs

| Decision | Reason | Trade-off |
| --- | --- | --- |
| Put order creation in one database RPC | Keep price validation, row locks, stock updates, order writes and audit in one transaction | More database-function logic to maintain and test |
| Use database permissions and RLS as the authority | UI visibility alone can be bypassed | Requires explicit grants, policies, and permission maintenance |
| Store order events append-only | Preserve an auditable history of state transitions | Additional reads and a separate customer/admin projection |
| Split customer AI from admin AI | Their data sensitivity and allowed actions are different | Two prompts, routes, tool sets and verification surfaces |
| Keep AI proposals read-only until human confirmation | Avoid turning model output into a direct privileged write | Adds an explicit review/confirmation step |
| Use request-scoped caching only | Deduplicate repeated session/actor reads without cross-user cache leakage | No long-lived cache benefit across requests |

## 8. Limitations and honest scope

Solenne is a portfolio-scale application, not a complete payment-backed commercial platform.

- Stripe dependencies are present, but payment-session creation, payment confirmation, webhook handling, and end-to-end payment reconciliation are not implemented. New orders remain pending payment.
- The customer assistant is not RAG and does not execute customer transactions.
- Some editorial and marketing content is static.
- Authenticated data-backed E2E journeys require a dedicated seeded staging environment and are not part of the public-shell CI job.
- The OpenNext Worker build has the documented Sharp bundling limitation.
- No Lighthouse or Web Vitals scores are claimed.

These limitations are part of the engineering record and should be communicated clearly in a portfolio or interview.

## 9. Suggested interview walkthrough

A concise technical walkthrough can follow this order:

1. **Product architecture:** explain how the storefront, account, admin, Supabase, and Cloudflare runtime fit together.
2. **Trust boundaries:** explain why the database—not the client UI—is authoritative for identity, permission, price, and stock.
3. **Atomic checkout:** walk through the RPC, variant row locks, price recomputation, idempotency key, and rollback behavior.
4. **Order history:** show how state transitions and append-only events commit together, and why customer/admin reads differ.
5. **AI design:** contrast live catalogue grounding for customers with permission-scoped tools and human-confirmed proposals for operators.
6. **Verification and trade-offs:** explain exactly what CI covers, what needs staging, and the known Worker build issue.

### Questions worth preparing for

- What happens if a checkout request times out after PostgreSQL commits but before the browser receives the response?
- Why is the unique idempotency index necessary even though the browser stores a key?
- Why are variant rows locked before decrementing stock?
- How does the database know which user is making the RPC call?
- Why does the customer timeline not receive actor and reason fields?
- How do you prevent a model from calling a tool it should not access?
- What is the difference between a tool proposal and a committed business mutation?
- Why is the customer assistant catalogue-grounded rather than RAG?
- What does a green public-shell E2E job prove—and what does it not prove?

## 10. References

- [Architecture Overview](../architecture/overview.md)
- [Production Readiness and CI](../quality/production-readiness.md)
- [Database / RBAC runbook](../../supabase/README.md)
- [Verified customer reviews feature](../features/reviews.md)
- [Wishlist feature](../features/wishlist.md)
