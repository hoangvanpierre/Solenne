import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ArrowRight, LogOut, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDefaultAddress } from "@/lib/addresses";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { signOutAction } from "@/app/actions/auth";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import {
  OrderHistoryCard,
  OrderHistoryCardSkeleton,
  RestrictedAccountNotice,
} from "@/components/account";

export default async function AccountPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let defaultAddress: Awaited<ReturnType<typeof getDefaultAddress>> = null;
  let accountRestricted = false;

  try {
    defaultAddress = await getDefaultAddress(user.id);
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) redirect("/login");
    if (!isRestrictedAuthError(error)) throw error;
    accountRestricted = true;
  }

  if (accountRestricted) {
    return (
      <div className="py-24 lg:py-32 account-page">
        <Container>
          <RestrictedAccountNotice locale={locale} />
        </Container>
      </div>
    );
  }

  return (
    <div className="py-24 lg:py-32 account-page">
      <Container>
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-10 border-b border-border">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs tracking-wider uppercase font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isVi ? "Thành viên Góc riêng Solenne" : "Solenne Sanctuary Member"}</span>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl font-semibold text-foreground">
              {isVi ? "Không Gian Cá Nhân" : "Account"}
            </h1>
            <p className="text-lg text-muted-foreground">
              {isVi
                ? "Nơi lưu giữ những nốt hương và hành trình cùng Solenne"
                : "Your personal space at Solenne"}
            </p>
          </div>

          <form action={signOutAction}>
            <Button
              variant="outline"
              type="submit"
              className="inline-flex items-center gap-2 text-xs uppercase tracking-wider h-auto min-h-11 py-2.5 px-5"
            >
              <LogOut className="w-4 h-4" />
              <span>{isVi ? "Đăng xuất" : "Sign Out"}</span>
            </Button>
          </form>
        </header>

        {/* Main: Order History (60%) + Shipping Sanctuary (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 pt-12">
          <section className="lg:col-span-3">
            <Suspense fallback={<OrderHistoryCardSkeleton />}>
              <OrderHistoryCard userId={user.id} />
            </Suspense>
          </section>

          <aside className="lg:col-span-2">
            <h2 className="font-serif text-2xl md:text-3xl font-medium text-foreground">
              {isVi ? "Địa chỉ an nhận" : "Shipping Sanctuary"}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {isVi
                ? "Điểm đến mặc định của quý khách, tự động điền khi thỉnh nến."
                : "Your default destination, filled in automatically at checkout."}
            </p>

            {defaultAddress ? (
              <div className="mt-8">
                <address className="text-base leading-loose text-foreground not-italic">
                  {defaultAddress.line1}
                  {defaultAddress.line2 && (
                    <>
                      <br />
                      {defaultAddress.line2}
                    </>
                  )}
                  <br />
                  {defaultAddress.city}
                  {defaultAddress.state && `, ${defaultAddress.state}`}{" "}
                  {defaultAddress.postalCode}
                  <br />
                  {isVi && defaultAddress.country === "Vietnam"
                    ? "Việt Nam"
                    : isVi && defaultAddress.country === "United States"
                    ? "Hoa Kỳ"
                    : defaultAddress.country}
                </address>
                <Link
                  href="/account/address"
                  className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  <span>{isVi ? "Chỉnh sửa địa chỉ" : "Edit address"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="mt-8">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {isVi
                    ? "Chưa có địa chỉ lưu sẵn — địa chỉ sẽ được ghi nhớ sau đơn hàng đầu tiên, hoặc bạn có thể thêm ngay bây giờ."
                    : "No saved address yet — one is saved automatically with your first order, or you can add it now."}
                </p>
                <Link
                  href="/account/address"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  <span>{isVi ? "Thêm địa chỉ" : "Add address"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </aside>
        </div>

        {/* Bespoke Profile: full-width settings panel */}
        <section className="mt-16 border-t border-border pt-12">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <h2 className="font-serif text-2xl md:text-3xl font-medium text-foreground">
                {isVi ? "Hồ sơ bản sắc" : "Bespoke Profile"}
              </h2>
              <p className="mt-2 max-w-lg text-base leading-relaxed text-muted-foreground">
                {isVi
                  ? "Nốt hương yêu thích, tiền tệ hiển thị và chi tiết tài khoản — lưu giữ tĩnh tại nơi đây."
                  : "Your scent preferences, currency, and account details — kept in one quiet place."}
              </p>
            </div>
            <Link
              href="/account/profile"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
            >
              <span>{isVi ? "Quản lý hồ sơ" : "Manage profile"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {isVi ? "Sở thích hương sắc" : "Scent Preferences"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                {isVi ? "Chưa được thiết lập riêng." : "Not personalized yet."}
              </p>
              <Link
                href="/collections"
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>{isVi ? "Khám phá các nốt hương" : "Discover scents"}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {isVi ? "Đơn vị tiền tệ" : "Currency"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                USD ($) / VND (₫)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isVi ? "Tùy chọn hiển thị tiền tệ linh hoạt." : "Multi-currency display supported."}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {isVi ? "Thông tin tài khoản" : "Account Details"}
              </p>
              <p className="mt-3 text-sm leading-relaxed break-all text-foreground">
                {user.email}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {isVi ? "Đồng hành từ " : "Member since "}
                {new Date(user.created_at).toLocaleDateString(isVi ? "vi-VN" : "en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>
        </section>
      </Container>
    </div>
  );
}
