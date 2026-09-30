import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { resolvePostLoginPath, sanitizeNextPath } from "@/lib/redirect";
import type { ActorContext } from "@/types";

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

  // Protect account, checkout, and admin management routes
  if (
    !user &&
    (request.nextUrl.pathname.startsWith("/account") ||
      request.nextUrl.pathname.startsWith("/checkout") ||
      request.nextUrl.pathname.startsWith("/admin"))
  ) {
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
