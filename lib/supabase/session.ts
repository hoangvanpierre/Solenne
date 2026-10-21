import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Per-request session access for the server render path.
//
// `supabase.auth.getUser()` is a network call to the Supabase Auth server and
// is, on a remote project, the most expensive single step of a management
// render. Before this module the admin path verified the same bearer token
// twice in one render — once in lib/authz.ts (authorization) and again in
// lib/admin-identity.ts (the shell's display name/email) — and built a fresh
// client each time.
//
// React's cache() memoizes both the client and the verified user for the
// duration of ONE request, so every caller in the same render tree (root
// layout, admin layout, page) shares a single verification. It is
// deduplication only:
//   - the same token is still verified against the Auth server, the same way;
//   - a new request gets a new scope and verifies again (no cross-request or
//     cross-user caching);
//   - the cached value is the full `User`, never a permission decision — every
//     route still re-checks its own permission through lib/authz.ts.
//
// Next.js documents this pattern for exactly this purpose:
// node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md
// ("Reusing data with React.cache" -> getUser wrapped in cache()).
// ---------------------------------------------------------------------------

/** One Supabase server client per request, shared by every server component. */
export const getSessionClient = cache(async () => createClient());

/**
 * The verified session user for the current request, or null when the request
 * carries no valid session. Memoized per request (see module header).
 */
export const getVerifiedUser = cache(async (): Promise<User | null> => {
  const supabase = await getSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ?? null;
});
