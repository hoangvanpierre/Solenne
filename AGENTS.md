<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Solenne — Agent Guide

Solenne is a luxury artisan scented-candle e-commerce storefront built with Next.js 16 (App Router), React 19, Tailwind CSS v4, and Supabase. The codebase is in an early "v0.1" stage: product data is placeholder/mock, checkout is not wired, and several routes referenced in nav/footer (`/collections`, `/about`, `/journal`, `/contact`, `/account`, `/login`, `/register`) do not yet have pages.

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
  layout.tsx            # Root layout: <html>/<body>, fonts (Geist, Geist Mono, Italianno), metadata
  globals.css           # Tailwind v4 theme (CSS variables + @theme inline), keyframes, utilities
  (marketing)/          # Route group — shares one marketing layout, no URL prefix
    layout.tsx          # "use client" — wraps every marketing page in SmoothScroll + AnnouncementBar + Navbar + MobileNav + CartDrawer + Footer
    page.tsx            # Home — Hero (eager) + 6 section components dynamically imported (ssr: true)
    products/
      page.tsx          # Product listing — reads PLACEHOLDER_PRODUCTS
      [slug]/page.tsx   # Product detail — async Server Component, awaits params, calls notFound() on miss
```

Key points:
- The `(marketing)` route group's layout is a **Client Component** (`"use client"`), so every marketing page renders inside a client boundary. `MobileNav` and `CartDrawer` are `dynamic(..., { ssr: false })` imports within it.
- Home page uses `dynamic()` with `ssr: true` for below-the-fold sections to keep the initial JS bundle small while still server-rendering HTML.
- Dynamic route params in Next 16 are **async** — `params: Promise<{ slug: string }>` must be awaited (see `app/(marketing)/products/[slug]/page.tsx`).
- Routes referenced in `lib/constants.ts` (`NAV_LINKS`, `FOOTER_LINKS`) like `/collections`, `/about`, `/journal`, `/contact`, `/faq`, `/shipping`, `/care-guide`, `/account`, `/login`, `/register` are **not yet implemented**. The middleware protects `/account*` and redirects logged-in users away from `/login`/`/register`, but those pages don't exist yet.

### Middleware & Supabase Auth

`middleware.ts` → `lib/supabase/middleware.ts` runs on every matched request (excludes `_next/static`, `_next/image`, `favicon.ico`, and common image extensions). It:
- Creates a Supabase server client bound to the request/response cookies.
- Calls `supabase.auth.getUser()` to refresh the session (do **not** insert logic between `createServerClient` and `getUser()` — see the comment in that file; it causes hard-to-debug random logouts).
- Redirects unauthenticated users from `/account*` → `/login`, and logged-in users from `/login`/`/register` → `/account`.

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

The `useCart` hook (`hooks/use-cart.ts`) wraps `useCartStore` and derives `itemCount`, `subtotal`, `shippingFee` (USD thresholds from `SHIPPING` constant), and `total` with `useMemo`. **It only computes USD shipping** — VND thresholds exist in `SHIPPING` but the hook doesn't branch on currency yet.

### Data layer (currently mock)

`lib/constants.ts` exports `PLACEHOLDER_PRODUCTS: Product[]` — the single source of product data right now. Both `products/page.tsx` and `products/[slug]/page.tsx` import it directly. When wiring real data, replace the `getProductBySlug` helper in `[slug]/page.tsx` and the `ProductGrid` source in `products/page.tsx` with Supabase queries (server client). The type definitions in `types/` (Product, ProductVariant, CartItem, Order, OrderItem, User, Address, Review) are ready for this.

## Conventions

### File organization

```
components/
  ui/           # Primitives: Button, Input, Badge, Skeleton, Separator, Container, IconButton — each barrel-exported via index.ts
  product/      # Product-domain components (card, grid, gallery, info, selectors, scent-notes)
  layout/       # Site chrome: AnnouncementBar, Navbar, MobileNav, CartDrawer, Footer
  sections/     # Marketing page sections (Hero, BrandStory, FeaturedProducts, CraftSection, ScentExplorer, Testimonials, Newsletter)
  animations/   # Motion primitives (SmoothScroll, ScrollReveal, TextReveal, ParallaxImage, HorizontalScroll, PinnedSection, MagneticButton)
hooks/          # Custom hooks (use-cart, use-locked-body, use-intersection, use-media-query)
stores/         # Zustand stores
lib/            # utils.ts (cn, formatPrice, slugify, ...), constants.ts, supabase/
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
- **Lenis** provides smooth scrolling via `<SmoothScroll>` wrapping the marketing layout. It respects `prefers-reduced-motion`. Lenis's `raf` loop is driven by `requestAnimationFrame`.
- **GSAP** + `@gsap/react` are dependencies but not yet used in any inspected component.
- **three.js** + `@react-three/fiber` + `@react-three/drei` are dependencies (likely for the `ScentExplorer` 3D section — verify before use).
- Global reduced-motion handling is in `globals.css` (`@media (prefers-reduced-motion: reduce)` zeroes out animation/transition durations).

### Currency & i18n

Dual-currency (USD default, VND) and dual-locale (`en`/`vi`) support is scaffolded:
- `formatPrice(amount, currency)` in `lib/utils.ts` handles both, with VND using 0 fraction digits and `vi-VN` locale.
- `CURRENCIES`, `CurrencyCode`, and `SHIPPING` (separate USD/VND thresholds) live in `lib/constants.ts`.
- `SCENT_CATEGORIES` carries bilingual `name`/`nameVi` and `description`/`descriptionVi` fields.
- `next-intl` is a dependency but no i18n routing/config is set up yet — `useUIStore.locale` is a plain state field, not wired to `next-intl`.

## Gotchas

- **`.env.local` is gitignored and contains live Supabase keys.** Never commit it. If env vars are missing, `createClient()` calls will throw at runtime (the `!` non-null assertions hide this from TS).
- **The `BEGIN:nextjs-agent-rules` / `END:nextjs-agent-rules` block at the top of this file is auto-managed by `next dev`.** Do not delete or edit it — `next dev` will re-add it as an uncommitted change. Committing it with your work keeps the tree clean.
- **`CLAUDE.md` is a one-line `@AGENTS.md` include** — edits go in this file, not `CLAUDE.md`.
- **The marketing layout is a Client Component**, so Server Components rendered inside it still work, but any shared layout-level context (e.g. a React Context provider) added there runs on the client.
- **Cart persistence only stores `items`** (via `partialize`) — `isCartOpen` resets to `false` on reload. The `useCart` hook spreads `...store` so `isCartOpen` reflects the in-memory value.
- **`useCart` shipping math is USD-only.** `SHIPPING` has VND fields but the hook hardcodes `SHIPPING.freeThresholdUSD`/`flatRateUSD`. Fix this before relying on VND checkout totals.
- **Product images are all empty arrays** (`images: []`) in placeholder data — `ProductCard` and `ProductGallery` render gradient/silhouette placeholders, not real `next/image` usage. When adding real images, switch to `next/image` and configure `next.config.ts` `images` domains.
- **Checkout button is a no-op** — `<Button>Checkout</Button>` in `cart-drawer.tsx` has no `onClick`/`href`. Stripe deps (`@stripe/stripe-js`, `stripe`) are installed but unused.
- **No tests exist.** There is no test script, no test files, no testing library installed. Run `npx tsc --noEmit` for typechecking.
- **`pnpm lint` runs `eslint` with no path** — it lints per the flat config's default file patterns. To lint a specific file: `npx eslint path/to/file.tsx`.
