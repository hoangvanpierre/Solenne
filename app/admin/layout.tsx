import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import {
  AuthError,
  requireActiveActor,
  requireAnyPermission,
} from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { signOutAction } from "@/app/actions/auth";
import { CONTACT_EMAIL } from "@/lib/constants";
import { MANAGEMENT_PERMISSIONS } from "@/lib/redirect";
import { Button } from "@/components/ui";
import { RestrictedAccountNotice } from "@/components/account";

// Server Component boundary for the management area. Lives outside the
// (marketing) layout (no storefront Navbar/Footer/SmoothScroll) but inside
// the root layout, so fonts and the AuthzProvider context are inherited.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let noManagementAccess = false;

  try {
    await requireActiveActor();
    await requireAnyPermission(MANAGEMENT_PERMISSIONS);
  } catch (error) {
    // 401: missing/ended session — same UX as the account surfaces.
    if (isUnauthenticatedAuthError(error)) redirect("/login?next=/admin");

    // Suspended/banned/inactive account — the S-3 restricted notice.
    if (isRestrictedAuthError(error)) {
      return (
        <div className="flex-1 py-24 lg:py-32 admin-scope">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <RestrictedAccountNotice locale={locale} />
          </div>
        </div>
      );
    }

    // 403 FORBIDDEN: an active account that holds none of the management
    // permissions. Generic copy only — no permission names, role details, or
    // database errors are exposed.
    if (error instanceof AuthError) {
      noManagementAccess = true;
    } else {
      // Unexpected failures keep surfacing instead of masquerading as an
      // authorization denial.
      throw error;
    }
  }

  if (noManagementAccess) {
    return (
      <div className="flex-1 py-24 lg:py-32 admin-scope">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <div className="rounded-2xl border border-border p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
              <ShieldAlert className="h-6 w-6 text-amber" />
            </div>

            <h2 className="mt-5 font-serif text-2xl font-medium text-foreground">
              {isVi ? "Khu vực không khả dụng" : "Area unavailable"}
            </h2>

            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
              {isVi ? (
                <>
                  Khu vực này được dành riêng cho đội ngũ Solenne. Nếu quý khách
                  cho rằng mình cần quyền truy cập, xin vui lòng liên hệ{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </>
              ) : (
                <>
                  This area is reserved for the Solenne team. If you believe
                  you should have access, please contact{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </>
              )}
            </p>

            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <form action={signOutAction}>
                <Button
                  variant="outline"
                  type="submit"
                  className="inline-flex items-center gap-2"
                >
                  <span>{isVi ? "Đăng xuất" : "Sign Out"}</span>
                </Button>
              </form>
              <Button asChild className="inline-flex items-center gap-2">
                <Link href="/">
                  <span>{isVi ? "Về tiệm nến" : "Return to Boutique"}</span>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 admin-scope">
      <header className="border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 sm:min-h-20 max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/admin"
            className="group flex items-center gap-2.5 sm:gap-3 transition-opacity hover:opacity-90"
          >
            <span className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Solenne
            </span>
            <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.2em] text-muted-foreground shadow-xs [font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]">
              {isVi ? "Quản trị" : "Administration"}
            </span>
          </Link>

          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[12px] sm:text-[13px] font-medium uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground [font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,sans-serif]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Về tiệm" : "Return to boutique"}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
