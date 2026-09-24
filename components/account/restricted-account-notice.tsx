import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { CONTACT_EMAIL } from "@/lib/constants";
import { Button } from "@/components/ui/button";

export interface RestrictedAccountNoticeProps {
  locale: string;
}

/**
 * Deliberate restricted-account state for the /account* and /checkout*
 * surfaces. Rendered ONLY after lib/authz.ts has thrown its
 * ACCOUNT_DISABLED AuthError (suspended/banned/inactive account) — it never
 * replaces or weakens that check, and a generic 403/FORBIDDEN permission
 * denial never reaches this component. The copy is intentionally generic: no
 * status codes, permission names, role details, or database errors are
 * exposed to the user.
 */
export function RestrictedAccountNotice({
  locale,
}: RestrictedAccountNoticeProps) {
  const isVi = locale === "vi";

  return (
    <div className="rounded-2xl border border-border p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
        <ShieldAlert className="h-6 w-6 text-amber" />
      </div>

      <h2 className="mt-5 font-serif text-2xl font-medium text-foreground">
        {isVi ? "Tài khoản bị hạn chế" : "Account restricted"}
      </h2>

      <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
        {isVi ? (
          <>
            Tài khoản Solenne của quý khách hiện đang bị hạn chế, nên khu vực
            này chưa khả dụng. Nếu quý khách cho rằng đây là nhầm lẫn, xin vui
            lòng liên hệ{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            — chúng tôi sẵn sàng hỗ trợ.
          </>
        ) : (
          <>
            Your Solenne account is currently restricted, so this area isn&apos;t
            available right now. If you believe this is a mistake, please
            contact{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              {CONTACT_EMAIL}
            </a>{" "}
            — we&apos;ll be glad to help.
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
          <Link href="/products">
            <span>{isVi ? "Tiếp tục dạo bước" : "Continue Shopping"}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}