import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePostLoginPath, sanitizeNextPath } from "@/lib/redirect";
import type { ActorContext } from "@/types";

const PROTECTED_ROUTE_SEGMENTS = ["/admin", "/account", "/checkout"] as const;

/**
 * Determines whether a pathname targets a protected route hierarchy (/admin, /account, /checkout).
 * Matches exact root path or child path segments (e.g. /admin and /admin/orders),
 * preventing false positives on sibling prefixes (e.g. /administrator, /accounting, /checkout-help).
 */
export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_ROUTE_SEGMENTS.some(
    (segment) => pathname === segment || pathname.startsWith(`${segment}/`)
  );
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast-path: Check if request carries any Supabase auth cookies.
  // Anonymous visitors without auth tokens should not incur remote getUser() roundtrips
  // or cookie-mutation thrashing on public routes.
  const hasAuthCookies = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  if (!hasAuthCookies) {
    // Gate protected routes for unauthenticated users immediately
    if (isProtectedPath(pathname)) {
      const url = request.nextUrl.clone();
      const originalTarget = `${pathname}${request.nextUrl.search}`;
      url.pathname = "/login";
      url.searchParams.set("next", originalTarget);
      return NextResponse.redirect(url);
    }

    // For all other routes (marketing, store, journal, about), pass through immediately
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Protect account, checkout, and admin management routes
  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    const originalTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.searchParams.set("next", originalTarget);
    return NextResponse.redirect(url);
  }

  // Redirect to role default or safe explicit next if logged in and visiting login/register
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/register")
  ) {
    const rawNext = request.nextUrl.searchParams.get("next");
    const next = rawNext ? sanitizeNextPath(rawNext, null) : null;

    let actor: ActorContext | null = null;
    try {
      const { data } = await supabase.rpc("current_actor");
      if (data && data.user_id === user.id) {
        actor = {
          userId: user.id,
          role: data.role ?? null,
          status: data.status ?? null,
          permissions: data.permissions ?? [],
        };
      }
    } catch {
      // Fall through with null actor if RPC fails
    }

    const destination = resolvePostLoginPath(actor, next);
    return NextResponse.redirect(new URL(destination, request.url));
  }

  return supabaseResponse;
}
