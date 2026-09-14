import { createClient } from "@supabase/supabase-js";

// Server-only client authenticated with the secret key. Use it exclusively in
// Server Actions / Server Components for writes that RLS blocks for end users
// (e.g. order_items) and for admin-level reads after verifying the session.
// Never import this module from a Client Component.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY environment variables"
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
