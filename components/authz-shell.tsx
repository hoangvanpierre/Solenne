import { AuthzProvider } from "@/hooks/use-authz";
import { getActorContext } from "@/lib/authz";

// Server wrapper that resolves the caller's RBAC context once per document
// and exposes it to client components as UX-only state. Reads the database
// (profiles -> roles -> permissions); never trusts client-supplied values.
// Fails open to `null` when unauthenticated or when the RBAC migration has
// not been applied yet — consumers treat null as "no permissions".
export async function AuthzShell({ children }: { children: React.ReactNode }) {
  let value = null;
  try {
    value = await getActorContext();
  } catch {
    value = null;
  }

  return <AuthzProvider value={value}>{children}</AuthzProvider>;
}
