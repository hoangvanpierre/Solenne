<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Solenne — Agent Guide

Solenne is a luxury artisan scented-candle e-commerce storefront built with Next.js 16 (App Router), React 19, Tailwind CSS v4, and Supabase. The codebase is in an early "v0.1" stage: journal content and marketing copy are static placeholders, online payment is not yet wired (orders are placed as "pending payment"; Stripe deps installed but unused), and product images are not yet wired to real assets.

## Commands

Package manager is **pnpm** (see `pnpm-workspace.yaml`). Scripts defined in `package.json`:

| Command | Script | Notes |
| --- | --- | --- |
| `pnpm dev` | `next dev` | Starts dev server on :3000. Re-regenerates the `BEGIN:nextjs-agent-rules` block at the top of this file. |
| `pnpm build` | `next build` | Production build. |
| `pnpm start` | `next start` | Serve the production build. |
| `pnpm lint` | `eslint` | ESLint flat config (`eslint.config.mjs`) using `eslint-config-next` core-web-vitals + TS presets. Note: runs `eslint` with no path arg — relies on config defaults. |

There is **no test runner, typecheck script, or formatter configured**. To typecheck, run `npx tsc --noEmit`. Do not add a test framework or formatter unless asked.

## Architecture & Data Flow

### Routing (App Router with route groups)

```
app/
  layout.tsx            # Root layout: <html>/<body>, font (Birthstone), metadata
  globals.css           # Tailwind v4 theme (CSS variables + @theme inline), keyframes, utilities
  (marketing)/          # Route group — shares one marketing layout, no URL prefix
    layout.tsx          # "use client" — wraps every marketing page in SmoothScroll + AnnouncementBar + Navbar + MobileNav + CartDrawer + Footer
    page.tsx            # Home — Hero (eager) + 6 section components dynamically imported (ssr: true)
    products/
    page.tsx          # Product listing — queries getProducts() from Supabase via lib/products.ts
    [slug]/page.tsx   # Product detail — async Server Component, queries getProductBySlug() from Supabase
  checkout/
    page.tsx          # Checkout — auth-gated; server page prefills contact info, renders CheckoutForm (client)
    success/page.tsx  # Order confirmation/receipt — reads ?number=<orderNumber>, shows "pending payment" status
```

Key points:
- The `(marketing)` route group's layout is a **Client Component** (`"use client"`), so every marketing page renders inside a client boundary. `MobileNav` and `CartDrawer` are `dynamic(..., { ssr: false })` imports within it.
- Home page uses `dynamic()` with `ssr: true` for below-the-fold sections to keep the initial JS bundle small while still server-rendering HTML.
- Dynamic route params in Next 16 are **async** — `params: Promise<{ slug: string }>` must be awaited (see `app/(marketing)/products/[slug]/page.tsx`).
- Auth routes (`/login`, `/register`, `/forgot-password`, `/reset-password`) and `/account` are implemented. All routes referenced in `lib/constants.ts` (`NAV_LINKS`, `FOOTER_LINKS`) exist: `/collections` (scent-family listing + `/collections/[slug]`, where a slug matches a `SCENT_CATEGORIES` id or `gift-sets`), `/about` (with `#craft`/`#ingredients`/`#sustainability` anchors), `/journal` (static posts from `lib/journal.ts` + SSG `/journal/[slug]`), `/contact` (client `ContactForm` in `components/sections/contact-form.tsx`, no backend — simulates success locally), `/faq`, `/shipping`, and `/care-guide`.

### Middleware & Supabase Auth

`middleware.ts` → `lib/supabase/middleware.ts` runs on every matched request (excludes `_next/static`, `_next/image`, `favicon.ico`, and common image extensions). It:
- Creates a Supabase server client bound to the request/response cookies.
- Calls `supabase.auth.getUser()` to refresh the session (do **not** insert logic between `createServerClient` and `getUser()` — see the comment in that file; it causes hard-to-debug random logouts).
- Redirects unauthenticated users from `/account*` and `/checkout*` → `/login`, and logged-in users from `/login`/`/register` → `/account`.

### Supabase client pattern

Three client factory files, all using `@supabase/ssr`:
- `lib/supabase/client.ts` — browser client (`createBrowserClient`), for Client Components.
- `lib/supabase/server.ts` — server client (`createServerClient` + `next/headers` cookies), for Server Components and Route Handlers.
- `lib/supabase/middleware.ts` — edge/middleware client with manual cookie forwarding.

Env vars (all in `.env.local`, **gitignored**): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`. Note the **new-style Supabase keys** (`sb_publishable_…`, `sb_secret_…`) — not the legacy `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.

A `@supabase/server` skill is installed at `.agents/skills/supabase-server/SKILL.md` (tracked via `skills-lock.json`). **Load that skill before writing any Edge Function or server-side code that uses `@supabase/server`** (e.g. `withSupabase`, `auth:` modes, Stripe webhooks). The skill documents breaking changes: `auth:` (not `allow`), mode values `'none'`/`'publishable'` (not `'always'`/`'public'`), and the `authMode` field rename.

### State management (Zustand)

Three stores in `stores/`:
- `cart-store.ts` — persisted to `localStorage` under key `"solenne-cart"` via `persist` + `partialize` (only `items` are persisted, not `isCartOpen`). `addItem` auto-opens the cart. Quantity ≤ 0 removes the item.
- `filter-store.ts` — ephemeral product filter state (category, priceRange, sortBy, search). Not persisted.
- `ui-store.ts` — ephemeral UI state (mobile nav, search, currency `'VND'|'USD'`, locale `'en'|'vi'`). Not persisted.

The `useCart` hook (`hooks/use-cart.ts`) wraps `useCartStore` and derives `itemCount`, `subtotal`, `shippingFee`, and `total` with `useMemo`. It reads `currency` from `useUIStore` and computes amounts in the display currency: when VND, subtotal/total are converted via the fixed `USD_TO_VND` rate (`lib/constants.ts`) because product prices are stored USD-only, and shipping uses the VND thresholds. It also exposes a `format(amountUSD)` helper; the cart drawer uses it for all price rendering.

### Data layer (Supabase)

Products and variants are stored in Supabase PostgreSQL (`products`, `product_variants` tables) and accessed via helper functions in `lib/products.ts` (`getProducts`, `getProductsByCategory`, `getProductBySlug`, `getFeaturedProducts`), which query with `createClient` from `@/lib/supabase/server` and map database fields to `Product` and `ProductVariant` models. A re-runnable seed script is available at `scripts/seed-products.mjs`.

### Orders

Orders live in the `orders` and `order_items` tables. The flow: CartDrawer "Checkout" → `/checkout` (login required, enforced by middleware + page-level `getUser` check) → `CheckoutForm` (client, `components/checkout/checkout-form.tsx`) → `createOrderAction` (`app/actions/orders.ts`) → `createOrder` in `lib/orders.ts`, which:
- Re-verifies the session server-side (userId always comes from `auth.getUser()`, never from client input).
- Recomputes all prices server-side from `product_variants` (client-sent cart items are only `{variantId, quantity}`), applies `SHIPPING` USD thresholds, and stores totals in **USD**.
- Inserts `orders` + `order_items` via the secret-key admin client (`lib/supabase/admin.ts`), decrements stock with an optimistic-concurrency guard, and generates `SLN-<base36>-<random>` order numbers.
- Sets status `"pending"` (displayed as "Pending Payment") — payment integration (Stripe) is not yet built; `stripe_session_id`/`stripe_payment_intent` columns are ready for it.
On success the client clears the cart and redirects to `/checkout/success?number=<orderNumber>`. The account page lists order history via `getOrdersForUser`.

**Order history UI** (`components/account/`): the account dashboard is an editorial layout — header ("Account" + tagline), a 60/40 two-column main section (`lg:grid-cols-5`, `lg:col-span-3`/`lg:col-span-2`) with Order History (compact `divide-y` rows, no mini-cards; 3 most recent, `countOrdersForUser` supplies the total for the "View all orders (N) →" link shown only when there are more than 3) beside Shipping Sanctuary (saved address + "Edit address →"), then a full-width Bespoke Profile settings panel (Scent Preferences / Currency / Account Details + "Manage profile →"). The Order History card is an async `OrderHistoryCard` inside `<Suspense>` (skeleton fallback). The full history lives at `/account/orders` (auth-protected by middleware; still uses bordered `OrderListItem`). States handled everywhere: empty, partial/full lists, loading (Suspense skeletons), and error (try/catch → friendly message).

**Account management pages**: `/account/address` (edit the default address via `AddressForm` → `updateAddressAction` → `saveDefaultAddress`) and `/account/profile` (name/phone via `ProfileForm` → `updateProfileAction` → admin-client `profiles` upsert). Schemas live in `lib/validations/account.ts`. These are the targets of the dashboard's "Edit address →" / "Manage profile →" actions.

**Saved addresses** (`lib/addresses.ts`, backed by the `addresses` table): `createOrder` also saves the checkout shipping address as the user's single **default** address (best-effort — never fails the order). The `/checkout` page prefills the form from it (plus `profiles.full_name`/`phone`), and the account page's "Shipping Sanctuary" card displays it. The table has no full-name/phone columns, so those always come from the profile.

## Conventions

### File organization

```
components/
  ui/           # Primitives: Button, Input, Badge, Skeleton, Separator, Container, IconButton — each barrel-exported via index.ts
  product/      # Product-domain components (card, grid, gallery, info, selectors, scent-notes)
  layout/       # Site chrome: AnnouncementBar, Navbar, MobileNav, CartDrawer, Footer
  sections/     # Marketing page sections (Hero, BrandStory, FeaturedProducts, CraftSection, ScentExplorer, Testimonials, Newsletter, ContactForm)
  animations/   # Motion primitives (SmoothScroll, ScrollReveal, TextReveal, ParallaxImage, HorizontalScroll, PinnedSection, MagneticButton)
hooks/          # Custom hooks (use-cart, use-locked-body, use-intersection, use-media-query)
stores/         # Zustand stores
lib/            # utils.ts (cn, formatPrice, slugify, ...), constants.ts, products.ts, journal.ts, supabase/, validations/
types/          # TypeScript interfaces; index.ts re-exports all
```

Every component directory has an `index.ts` barrel. **Import from the barrel, not deep paths** — e.g. `import { Button } from "@/components/ui"` and `import { ProductCard, ProductGrid } from "@/components/product"`. The `@/*` path alias maps to the repo root (`tsconfig.json` paths).

### Component style

- **Client components** are marked with a leading `"use client";` directive at column 0. Server Components (pages, root layout) have none.
- Components are **named function exports**, not default exports, except page/layout files (Next.js requires default exports there). The barrel `index.ts` files re-export named exports.
- UI primitives use `forwardRef` (see `button.tsx`), accept a `className` prop merged via `cn()`, and support `asChild` via `@radix-ui/react-slot` (Button uses `Slot` when `asChild`, enabling `<Button asChild><Link/></Button>`).
- Props interfaces are named `XProps` and exported alongside the component.
- Styling: Tailwind v4 utility classes + CSS variables. Brand colors are accessed as direct classes (`bg-amber`, `text-cream`, `bg-sage`, `text-blush`) defined in `globals.css` `@theme inline` block, in addition to the semantic tokens (`bg-primary`, `text-foreground`, etc.).

### Tailwind v4 specifics

This project uses **Tailwind CSS v4** (not v3). Differences that bite:
- Config is CSS-first via `@import "tailwindcss"` + `@theme inline { ... }` in `app/globals.css`. There is **no `tailwind.config.ts`**. Colors, fonts, radii, and animations are all CSS variables.
- The PostCSS plugin is `@tailwindcss/postcss` (see `postcss.config.mjs`), not the old `tailwindcss` plugin.
- Dark mode keys off `@media (prefers-color-scheme: dark)` on `:root` (system preference, not a `.dark` class toggle). `useUIStore` has a `locale` field but no dark-mode toggle.
- Custom utilities like `.grain-overlay`, `.text-gradient`, `.glass`, `.line-clamp-2/3` are defined as plain CSS classes at the bottom of `globals.css`.
- `next.config.ts` enables `experimental.optimizePackageImports` for `lucide-react`, `framer-motion`, `gsap` — import named icons/components from these packages directly.

### Animation stack

- **framer-motion** (`motion`, `AnimatePresence`, `useScroll`, `useTransform`, `Variants`) is the primary animation library. All animation components are Client Components.
- **Lenis** provides smooth scrolling via `<SmoothScroll>` wrapping the marketing layout. It respects `prefers-reduced-motion`. Lenis's `raf` loop is driven by the **gsap ticker** (official integration: `lenis.on("scroll", ScrollTrigger.update)` + `gsap.ticker.lagSmoothing(0)`). Because the layout persists across client-side navigations, SmoothScroll recomputes on every route change (`lenis.resize()`, `scrollTo(0, { immediate: true })`, `ScrollTrigger.refresh()`) — without this, Lenis clamps wheel scrolling to the previous page's stale height limit and the page appears stuck.
- **GSAP** + `@gsap/react` drive the `BrandStory` scroll-scrub section (`components/sections/brand-story.tsx`).
- `html` must **not** have `scroll-behavior: smooth` — it conflicts with Lenis (kept out of `globals.css` deliberately).
- **`useLockedBody`** uses a module-level lock counter so overlapping locks (CartDrawer + MobileNav) capture/restore body styles only once — restoring per-instance could leave the body stuck with `overflow: hidden`.
- **three.js** + `@react-three/fiber` + `@react-three/drei` are dependencies (likely for the `ScentExplorer` 3D section — verify before use).
- Global reduced-motion handling is in `globals.css` (`@media (prefers-reduced-motion: reduce)` zeroes out animation/transition durations).

### Currency & i18n

Dual-currency (USD default, VND) and dual-locale (`en`/`vi`) support is scaffolded:
- `formatPrice(amount, currency)` in `lib/utils.ts` handles both, with VND using 0 fraction digits and `vi-VN` locale.
- `CURRENCIES`, `CurrencyCode`, and `SHIPPING` (separate USD/VND thresholds) live in `lib/constants.ts`.
- `SCENT_CATEGORIES` carries bilingual `name`/`nameVi` and `description`/`descriptionVi` fields.
- `next-intl` is wired up **cookie-based, without locale-prefixed routes** (`i18n/request.ts` reads `NEXT_LOCALE`; no `[locale]` segment). `components/layout/i18n-provider.tsx` (a client component in the root layout) owns switching: on toggle it swaps client messages + locale state, writes the `NEXT_LOCALE` cookie (client-side synchronously, plus `setLocaleAction` for server-side persistence), then performs a **genuine full page load** (`window.location.reload()`) so the server re-renders the same route, query string, and hash for the new locale. `useAppLocale()` (`hooks/use-locale.ts`) returns the active locale for both server- and client-rendered code.
- Language switches park the visitor's scroll position in `sessionStorage` (`solenne:locale-scroll-position`) via `lib/locale-scroll-restoration.ts` and restore it once the new locale has rendered — see the module header for the full routine. `I18nProvider` mounts the `useLocaleScrollRestoration()` hook, which is what puts the visitor back in the reloaded document — the outgoing document deliberately does not restore, so the parked payload survives the reload. `SmoothScroll` consults `isLocaleScrollRestorationPending()` before its route-change `lenis.scrollTo(0)`, so a locale switch that ever becomes a real route change cannot reset the viewport to the top. That guard honours both the in-memory in-flight flag and an unconsumed `sessionStorage` payload, so it holds across a genuine full page load too — where the module state is brand new.

## Gotchas

- **`.env.local` is gitignored and contains live Supabase keys.** Never commit it. If env vars are missing, `createClient()` calls will throw at runtime (the `!` non-null assertions hide this from TS).
- **The `BEGIN:nextjs-agent-rules` / `END:nextjs-agent-rules` block at the top of this file is auto-managed by `next dev`.** Do not delete or edit it — `next dev` will re-add it as an uncommitted change. Committing it with your work keeps the tree clean.
- **`CLAUDE.md` is a one-line `@AGENTS.md` include** — edits go in this file, not `CLAUDE.md`.
- **The marketing layout is a Client Component**, so Server Components rendered inside it still work, but any shared layout-level context (e.g. a React Context provider) added there runs on the client.
- **Cart persistence only stores `items`** (via `partialize`) — `isCartOpen` resets to `false` on reload. The `useCart` hook spreads `...store` so `isCartOpen` reflects the in-memory value.
- **`useCart` converts via a fixed `USD_TO_VND` rate** (`lib/constants.ts`), not live exchange rates. Product prices are USD-only in Supabase, so all VND display amounts (including shipping/total) are derived. The currency toggle lives in `useUIStore` but no UI sets it yet.
- **Product images are all empty arrays** (`images: []`) in placeholder data — `ProductCard` and `ProductGallery` render gradient/silhouette placeholders, not real `next/image` usage. When adding real images, switch to `next/image` and configure `next.config.ts` `images` domains.
- **`order_items` has an RLS insert policy that rejects authenticated users' inserts** (new row violates the policy; the policy appears misconfigured — anon inserts are plain-denied too). Order writes therefore go through the secret-key admin client in server actions. If you fix the policy (e.g. `WITH CHECK (auth.uid() = (select user_id from orders o where o.id = order_id))`), the current admin-client flow still works unchanged.
- **Orders are stored in USD.** `useCart` may display VND, but `createOrder` recomputes and stores USD totals from `SHIPPING` USD thresholds; when payment is added, keep the DB in USD and convert only for display.
- **No tests exist.** There is no test script, no test files, no testing library installed. Run `npx tsc --noEmit` for typechecking.
- **`pnpm lint` runs `eslint` with no path** — it lints per the flat config's default file patterns. To lint a specific file: `npx eslint path/to/file.tsx`.
