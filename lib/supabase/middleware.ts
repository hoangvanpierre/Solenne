import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // 1. Detect locale prefix (e.g. /en/..., /vi/..., or /en, /vi)
  const pathname = request.nextUrl.pathname;
  const localeMatch = pathname.match(/^\/(en|vi)(?:\/(.*))?$/);
  const hasLocalePrefix = Boolean(localeMatch);
  const urlLocale = localeMatch ? (localeMatch[1] as "en" | "vi") : null;
  const rawPath = localeMatch ? `/${localeMatch[2] || ""}` : pathname;
  const cleanPath = rawPath === "" ? "/" : rawPath.replace(/\/+$/, "") || "/";

  // Determine effective locale: URL prefix takes precedence, then cookie, fallback to "en"
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value as "en" | "vi" | undefined;
  const effectiveLocale = urlLocale || (cookieLocale === "vi" ? "vi" : "en");

  // 2. Resolve route aliases:
  // /shop -> /products, /shop/* -> /products/*
  // /search -> /products
  let canonicalPath = cleanPath;
  if (cleanPath === "/shop" || cleanPath.startsWith("/shop/")) {
    canonicalPath = cleanPath.replace(/^\/shop/, "/products");
  } else if (cleanPath === "/search") {
    canonicalPath = "/products";
  }

  // 3. Protect account and checkout routes (supporting both localized and unlocalized paths)
  const loginPath = hasLocalePrefix ? `/${urlLocale}/login` : "/login";
  const accountPath = hasLocalePrefix ? `/${urlLocale}/account` : "/account";

  if (
    !user &&
    (canonicalPath.startsWith("/account") ||
      canonicalPath.startsWith("/checkout"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = loginPath;
    return NextResponse.redirect(url);
  }

  // Redirect to account if logged in and visiting login/register
  if (
    user &&
    (canonicalPath === "/login" || canonicalPath === "/register")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = accountPath;
    return NextResponse.redirect(url);
  }

  // 4. Determine response: rewrite if locale prefix or route alias was used, else pass through
  let response: NextResponse;
  if (hasLocalePrefix || canonicalPath !== pathname) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = canonicalPath;
    response = NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: request.headers,
      },
    });
  } else {
    response = supabaseResponse;
  }

  // 5. Synchronize NEXT_LOCALE cookie with the effective locale
  response.cookies.set("NEXT_LOCALE", effectiveLocale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });

  // 6. Forward all Supabase session cookies so auth stays active
  supabaseResponse.cookies.getAll().forEach((c) => {
    response.cookies.set(c);
  });

  return response;
}
