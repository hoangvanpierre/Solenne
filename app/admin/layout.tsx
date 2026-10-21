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
import { filterAdminNav } from "@/lib/admin-nav";
import { getAdminShellIdentity } from "@/lib/admin-identity";
import type { ActorContext, RoleName } from "@/types";
import { Button } from "@/components/ui";
import { RestrictedAccountNotice } from "@/components/account";
import { AdminShell } from "@/components/admin";

// Server Component boundary for the management area. Lives outside the
// (marketing) layout (no storefront Navbar/Footer/SmoothScroll) but inside
// the root layout, so fonts and the AuthzProvider context are inherited.
//
// This file remains the authoritative gate for every /admin route. The shell
// below is presentation only: it receives a navigation model that has already
// been filtered by the actor's real permissions, and each route still performs
// its own requirePermission() check on top of this one.

const ROLE_LABELS: Record<RoleName, { en: string; vi: string }> = {
  admin: { en: "Administrator", vi: "Quản trị viên" },
  manager: { en: "Manager", vi: "Quản lý" },
  staff: { en: "Staff", vi: "Nhân viên" },
  customer: { en: "Customer", vi: "Khách hàng" },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let actor: ActorContext | null = null;
  let noManagementAccess = false;

  try {
    await requireActiveActor();
    actor = await requireAnyPermission(MANAGEMENT_PERMISSIONS);
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

  // Unreachable in practice: every branch above either returns or throws.
  // Fail closed rather than render management chrome without an actor.
  if (!actor) {
    throw new Error("Admin layout: authorization context unavailable.");
  }

  const identity = await getAdminShellIdentity();

  const roleLabel = actor.role
    ? isVi
      ? ROLE_LABELS[actor.role].vi
      : ROLE_LABELS[actor.role].en
    : isVi
      ? "Đội ngũ"
      : "Team";

  return (
    <div className="flex-1 min-w-0 admin-scope">
      <AdminShell
        groups={filterAdminNav(actor.permissions)}
        locale={locale}
        roleLabel={roleLabel}
        fullName={identity.fullName}
        email={identity.email}
      >
        {children}
      </AdminShell>
    </div>
  );
}
