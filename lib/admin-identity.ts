import { getSessionClient, getVerifiedUser } from "@/lib/supabase/session";

// ---------------------------------------------------------------------------
// Display identity for the management shell.
//
// DISPLAY ONLY. This never participates in an authorization decision: the
// caller (app/admin/layout.tsx) runs requireActiveActor() +
// requireAnyPermission(MANAGEMENT_PERMISSIONS) first, and every route and
// server action re-checks its own permission. The email here is the caller's
// own session email, and the profile row is the caller's own row (permitted by
// the profiles_select_own RLS policy).
//
// The session user comes from getVerifiedUser(), which lib/authz.ts has
// already resolved for this request, so the shell does not verify the same
// bearer token a second time (one fewer Auth round trip per page load).
//
// Fails soft: any lookup error yields nulls so a cosmetic header detail can
// never take down an otherwise-authorized dashboard.
// ---------------------------------------------------------------------------

export interface AdminShellIdentity {
  fullName: string | null;
  email: string | null;
}

const EMPTY_IDENTITY: AdminShellIdentity = { fullName: null, email: null };

export async function getAdminShellIdentity(): Promise<AdminShellIdentity> {
  try {
    const user = await getVerifiedUser();

    if (!user) return EMPTY_IDENTITY;

    const metadataName =
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name.trim()
        : "";

    let profileName = "";

    try {
      const supabase = await getSessionClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (typeof profile?.full_name === "string") {
        profileName = profile.full_name.trim();
      }
    } catch {
      // Profile row unavailable (or not yet created) — fall back to metadata.
    }

    return {
      fullName: profileName || metadataName || null,
      email: user.email?.trim() || null,
    };
  } catch (error) {
    console.error(
      "getAdminShellIdentity: unable to resolve display identity:",
      error instanceof Error ? error.message : "unknown error"
    );
    return EMPTY_IDENTITY;
  }
}
