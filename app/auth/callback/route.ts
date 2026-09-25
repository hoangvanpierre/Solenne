import { NextResponse } from "next/server";
import { sanitizeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const {
    searchParams,
    origin,
    host: requestHost,
  } = new URL(request.url);
  const code = searchParams.get("code");

  // S-2 follow-up: `next` is user-controlled — register/reset emails embed it
  // and anyone can open this URL directly. It goes through the same sanitizer
  // as the login/register flows, so unsafe values fall back to /account instead
  // of composing a foreign origin (`@evil.example`, `.evil.example`, `:8080`)
  // and malformed ones (`javascript:alert(1)`) can no longer throw a 500.
  const next = sanitizeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      // The header is client-suppliable, so it is honoured only when it names
      // the host this request actually arrived on. Any other value (e.g.
      // `X-Forwarded-Host: evil.example`) could send the visitor to an
      // attacker-controlled origin even though `next` itself is already safe.
      const trustedForwardedHost =
        forwardedHost && forwardedHost.toLowerCase() === requestHost.toLowerCase()
          ? forwardedHost
          : null;

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (trustedForwardedHost) {
        return NextResponse.redirect(`https://${trustedForwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Return the user to an error page or back to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
