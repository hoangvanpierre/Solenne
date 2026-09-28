import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeNextPath } from "@/lib/redirect";

export async function updateSession(request: NextRequest) {
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

  // Protect account and checkout routes
  if (
    !user &&
    (request.nextUrl.pathname.startsWith("/account") ||
      request.nextUrl.pathname.startsWith("/checkout"))
  ) {
    const url = request.nextUrl.clone();
    const originalTarget = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    url.pathname = "/login";
    url.searchParams.set("next", originalTarget);
    return NextResponse.redirect(url);
  }

  // Redirect to account or safe explicit next if logged in and visiting login/register
  if (
    user &&
    (request.nextUrl.pathname === "/login" ||
      request.nextUrl.pathname === "/register")
  ) {
    const rawNext = request.nextUrl.searchParams.get("next");
    const next = rawNext ? sanitizeNextPath(rawNext, null) : null;
    const url = request.nextUrl.clone();
    if (
      next &&
      !next.startsWith("/admin") &&
      !next.startsWith("/login") &&
      !next.startsWith("/register")
    ) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    url.pathname = "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
