import { AuthzProvider } from "@/hooks/use-authz";
import { getActorContext } from "@/lib/authz";

// Server wrapper that resolves the caller's RBAC context once per document
// and exposes it to client components as UX-only state. Reads the database
// (profiles -> roles -> permissions); never trusts client-supplied values.
//
// `value === null` now means ONLY "unauthenticated". Any other lookup
// failure (missing migration, database error) is surfaced as the explicit
// `unavailable` authz state instead of being silently converted into "no
// permissions", and is logged server-side. No error detail crosses to the
// client — the provider receives only a boolean.
export async function AuthzShell({ children }: { children: React.ReactNode }) {
  let value = null;
  let unavailable = false;
  try {
    value = await getActorContext();
  } catch (error) {
    unavailable = true;
    console.error(
      "AuthzShell: authorization context unavailable:",
      error instanceof Error ? error.message : "unknown error"
    );
  }

  return (
    <AuthzProvider value={value} unavailable={unavailable}>
      {children}
    </AuthzProvider>
  );
}
