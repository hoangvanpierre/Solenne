import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Heart, LogOut, ShieldCheck, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDefaultAddress } from "@/lib/addresses";
import { getActorContext } from "@/lib/authz";
import { hasManagementAccess } from "@/lib/redirect";
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
  const tWishlist = await getTranslations("wishlist");
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

  let actor = null;
  try {
    actor = await getActorContext();
  } catch (actorError) {
    console.error("AccountPage: Failed to resolve actor context:", actorError);
  }
  const isManagement = hasManagementAccess(actor);

  let profile: { full_name: string | null; phone: string | null } | null = null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  } catch (profileError) {
    console.warn("AccountPage: Failed to load profile:", profileError);
  }

  const displayName =
    profile?.full_name?.trim() ||
    user.user_metadata?.full_name?.trim() ||
    (isVi ? "Khách hàng ẩn danh" : "Anonymous Member");
  const phone = profile?.phone?.trim() || null;
  const email = user.email?.trim() || null;

  return (
    <div className="py-24 lg:py-32 account-page">
      <Container>
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-10 border-b border-border">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-[11px] tracking-wider uppercase font-normal">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isVi ? "Thành viên Góc riêng Solenne" : "Solenne Sanctuary Member"}</span>
              </div>
              {isManagement && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-muted/60 text-muted-foreground text-[11px] tracking-wider uppercase font-normal">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber" />
                  <span>{isVi ? "Đội ngũ Solenne" : "Solenne Staff"}</span>
                </div>
              )}
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] text-foreground tracking-[0.02em]">
              {isVi ? "Không Gian Cá Nhân" : "Account"}
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground font-normal">
              {isVi
                ? "Nơi lưu giữ những nốt hương và hành trình cùng Solenne"
                : "Your personal space at Solenne"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Wishlist is a first-class account destination, so it is reachable
                from the dashboard header on every breakpoint. */}
            <Button
              asChild
              variant="outline"
              className="inline-flex items-center gap-2 text-[11.5px] uppercase tracking-wider h-auto min-h-11 py-2.5 px-5 font-normal"
            >
              <Link href="/account/wishlist">
                <Heart className="w-4 h-4" />
                <span>{tWishlist("viewWishlist")}</span>
              </Link>
            </Button>

            {isManagement && (
              <Button
                asChild
                className="group inline-flex items-center gap-2 text-[11.5px] uppercase tracking-wider h-auto min-h-11 py-2.5 px-5 rounded-full bg-warm-black text-cream hover:bg-warm-black/85 border border-warm-black/80 shadow-sm transition-all cursor-pointer font-normal"
              >
                <Link href="/admin" className="inline-flex items-center gap-2 text-cream">
                  <ShieldCheck className="w-4 h-4 text-amber shrink-0" />
                  <span className="text-cream font-normal tracking-wider">
                    {isVi ? "Trung tâm Quản trị" : "Admin Hub"}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5 text-cream/80 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
            )}

            <form action={signOutAction}>
              <Button
                variant="outline"
                type="submit"
                className="inline-flex items-center gap-2 text-[11.5px] uppercase tracking-wider h-auto min-h-11 py-2.5 px-5 font-normal"
              >
                <LogOut className="w-4 h-4" />
                <span>{isVi ? "Đăng xuất" : "Sign Out"}</span>
              </Button>
            </form>
          </div>
        </header>

        {/* Main: Order History (60%) + Shipping Sanctuary (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 pt-12">
          <section className="lg:col-span-3">
            <Suspense fallback={<OrderHistoryCardSkeleton />}>
              <OrderHistoryCard userId={user.id} />
            </Suspense>
          </section>

          <aside className="lg:col-span-2">
            <h2 className="font-serif text-xl sm:text-2xl font-normal text-foreground leading-[1.28]">
              {isVi ? "Địa chỉ an nhận" : "Shipping Sanctuary"}
            </h2>
            <p className="mt-2 text-[13.5px] sm:text-[14px] leading-relaxed text-muted-foreground font-normal">
              {isVi
                ? "Điểm đến mặc định của quý khách, tự động điền khi thỉnh nến."
                : "Your default destination, filled in automatically at checkout."}
            </p>

            {defaultAddress ? (
              <div className="mt-7">
                <address className="text-[13.5px] sm:text-[14px] leading-relaxed text-foreground not-italic font-normal">
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
                  className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-normal text-foreground underline-offset-4 hover:underline"
                >
                  <span>{isVi ? "Chỉnh sửa địa chỉ" : "Edit address"}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="mt-7">
                <p className="text-[13px] leading-relaxed text-muted-foreground font-normal">
                  {isVi
                    ? "Chưa có địa chỉ lưu sẵn — địa chỉ sẽ được ghi nhớ sau đơn hàng đầu tiên, hoặc bạn có thể thêm ngay bây giờ."
                    : "No saved address yet — one is saved automatically with your first order, or you can add it now."}
                </p>
                <Link
                  href="/account/address"
                  className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-normal text-foreground underline-offset-4 hover:underline"
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
              <h2 className="font-serif text-xl sm:text-2xl font-normal text-foreground leading-[1.28]">
                {isVi ? "Hồ sơ bản sắc" : "Bespoke Profile"}
              </h2>
              <p className="mt-2 max-w-lg text-[13.5px] sm:text-[14px] leading-relaxed text-muted-foreground font-normal">
                {isVi
                  ? "Nốt hương yêu thích, tiền tệ hiển thị và chi tiết tài khoản — lưu giữ tĩnh tại nơi đây."
                  : "Your scent preferences, currency, and account details — kept in one quiet place."}
              </p>
            </div>
            <Link
              href="/account/profile"
              className="inline-flex items-center gap-1.5 text-[13px] font-normal text-foreground underline-offset-4 hover:underline"
            >
              <span>{isVi ? "Quản lý hồ sơ" : "Manage profile"}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-normal">
                {isVi ? "Sở thích hương sắc" : "Scent Preferences"}
              </p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-foreground font-normal">
                {isVi ? "Chưa được thiết lập riêng." : "Not personalized yet."}
              </p>
              <Link
                href="/collections"
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground font-normal"
              >
                <span>{isVi ? "Khám phá các nốt hương" : "Discover scents"}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-normal">
                {isVi ? "Đơn vị tiền tệ" : "Currency"}
              </p>
              <p className="mt-2.5 text-[13px] leading-relaxed text-foreground font-normal">
                USD ($) / VND (₫)
              </p>
              <p className="mt-1 text-[11.5px] text-muted-foreground font-normal">
                {isVi ? "Tùy chọn hiển thị tiền tệ linh hoạt." : "Multi-currency display supported."}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-normal">
                {isVi ? "Thông tin tài khoản" : "Account Information"}
              </p>
              <div className="mt-2.5 space-y-2 text-[13px]">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-normal">
                    {isVi ? "Tên hiển thị" : "Display Name"}
                  </span>
                  <span className="font-normal text-foreground mt-0.5 block text-[13.5px]">
                    {displayName}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-normal">
                    {isVi ? "Số điện thoại" : "Phone"}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal tabular-nums text-foreground">
                    {phone || (
                      <span className="text-muted-foreground italic">
                        {isVi ? "Chưa cung cấp" : "Not provided"}
                      </span>
                    )}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block font-normal">
                    {isVi ? "Địa chỉ email" : "Email Address"}
                  </span>
                  <span className="mt-0.5 block text-[13px] break-all text-foreground font-normal">
                    {email || (
                      <span className="text-muted-foreground italic">
                        {isVi ? "Chưa cung cấp" : "Not provided"}
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <p className="mt-3 text-[11.5px] text-muted-foreground font-normal tabular-nums">
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
