import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { CheckCircle2, Package, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { getOrderByNumber } from "@/lib/orders";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { RestrictedAccountNotice } from "@/components/account";
import { CONTACT_EMAIL } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Order Confirmed — Solenne",
  description: "Your Solenne order has been placed.",
};

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ number?: string }>;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const { number } = await searchParams;
  const locale = await getLocale();
  const isVi = locale === "vi";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let order: Awaited<ReturnType<typeof getOrderByNumber>> = null;
  let accountRestricted = false;

  try {
    order = number ? await getOrderByNumber(number, user.id) : null;
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) redirect("/login");
    if (!isRestrictedAuthError(error)) throw error;
    accountRestricted = true;
  }

  if (accountRestricted) {
    return (
      <div className="py-24 lg:py-32">
        <Container className="max-w-3xl">
          <RestrictedAccountNotice locale={locale} />
        </Container>
      </div>
    );
  }

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/20">
            <CheckCircle2 className="h-8 w-8 text-sage" />
          </div>
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Trân trọng cảm ơn quý khách" : "Thank you for your order"}
          </h1>
          {order && (
            <p className="text-muted-foreground text-sm sm:text-base leading-relaxed font-normal">
              {isVi ? (
                <>
                  Tác phẩm với mã đơn{" "}
                  <span className="font-normal tabular-nums text-foreground">
                    {order.orderNumber}
                  </span>{" "}
                  đã được xác nhận và lưu giữ trang trọng.
                </>
              ) : (
                <>
                  Order{" "}
                  <span className="font-normal tabular-nums text-foreground">
                    {order.orderNumber}
                  </span>{" "}
                  is confirmed and reserved.
                </>
              )}
            </p>
          )}
        </div>

        {order ? (
          <>
            <div className="rounded-2xl border border-border p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-border pb-6">
                <div className="flex items-center gap-2 text-[13px]">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground font-normal">
                    {isVi ? "Trạng thái:" : "Status:"}
                  </span>
                  <span className="rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 text-[11px] font-normal uppercase tracking-wider text-amber">
                    {isVi ? "Đang chờ thanh toán" : "Pending Payment"}
                  </span>
                </div>
                <span className="text-[13px] text-muted-foreground font-normal tabular-nums">
                  {new Date(order.createdAt).toLocaleDateString(isVi ? "vi-VN" : "en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="space-y-4">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-[13.5px] font-normal text-foreground">
                        {item.productName}
                      </p>
                      <p className="text-[12px] text-muted-foreground font-normal tabular-nums">
                        {item.variantName}
                        {item.variantName ? " · " : ""}
                        {isVi ? "Số lượng:" : "Qty"} {item.quantity}
                      </p>
                    </div>
                    <p className="whitespace-nowrap text-[13px] font-normal tabular-nums text-foreground">
                      {formatPrice(item.totalPrice)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-2.5 border-t border-border pt-5 text-[13px] font-normal">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {isVi ? "Tạm tính" : "Subtotal"}
                  </span>
                  <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {isVi ? "Phí vận chuyển" : "Shipping"}
                  </span>
                  <span className="tabular-nums">
                    {order.shippingFee === 0
                      ? isVi
                        ? "Trân quý miễn phí"
                        : "Free"
                      : formatPrice(order.shippingFee)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-[14.5px] sm:text-[15px] font-normal text-foreground">
                  <span>{isVi ? "Tổng cộng" : "Total"}</span>
                  <span className="tabular-nums">{formatPrice(order.total)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-6 text-[13.5px] font-normal leading-relaxed">
                <h2 className="mb-3 font-serif text-base font-normal text-foreground leading-[1.3]">
                  {isVi ? "Địa chỉ đón nhận" : "Shipping to"}
                </h2>
                <p className="text-muted-foreground">
                  {order.shippingAddress.fullName}
                  <br />
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 && (
                    <>
                      <br />
                      {order.shippingAddress.line2}
                    </>
                  )}
                  <br />
                  {order.shippingAddress.city}
                  {order.shippingAddress.state && `, ${order.shippingAddress.state}`}{" "}
                  {order.shippingAddress.postalCode}
                  <br />
                  {isVi && order.shippingAddress.country === "Vietnam"
                    ? "Việt Nam"
                    : isVi && order.shippingAddress.country === "United States"
                    ? "Hoa Kỳ"
                    : order.shippingAddress.country}
                </p>
              </div>
              <div className="rounded-2xl border border-border p-6 text-[13.5px] font-normal leading-relaxed">
                <h2 className="mb-3 flex items-center gap-2 font-serif text-base font-normal text-foreground leading-[1.3]">
                  <Mail className="h-4 w-4" />
                  {isVi ? "Bước tiếp theo" : "Next step"}
                </h2>
                <p className="leading-relaxed text-muted-foreground">
                  {isVi ? (
                    <>
                      Phương thức thanh toán trực tuyến đang được hoàn thiện. Đơn hàng của quý khách đã được lưu giữ trang trọng và an toàn — Nhà hương sẽ gửi email đến{" "}
                      <span className="font-normal text-foreground">
                        {order.shippingAddress.email ?? user.email}
                      </span>{" "}
                      kèm hướng dẫn thanh toán chi tiết, hoặc quý khách có thể liên hệ chúng tôi bất cứ lúc nào qua{" "}
                      <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        {CONTACT_EMAIL}
                      </a>
                      .
                    </>
                  ) : (
                    <>
                      Online payment is on its way. Until it&apos;s enabled, your
                      order is safely reserved — we&apos;ll email{" "}
                      <span className="font-medium text-foreground">
                        {order.shippingAddress.email ?? user.email}
                      </span>{" "}
                      with payment instructions, or you can reach us anytime at{" "}
                      <a
                        href={`mailto:${CONTACT_EMAIL}`}
                        className="underline underline-offset-4 hover:text-foreground"
                      >
                        {CONTACT_EMAIL}
                      </a>
                      .
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/products">
                  {isVi ? "Tiếp tục dạo bước" : "Continue Shopping"}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/account">
                  {isVi ? "Xem lịch sử đơn hàng" : "View My Orders"}
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border p-10 text-center">
            <p className="text-muted-foreground">
              {isVi ? (
                <>
                  Không tìm thấy thông tin đơn hàng này. Nếu quý khách tin rằng có sự nhầm lẫn, xin vui lòng liên hệ{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </>
              ) : (
                <>
                  We couldn&apos;t find that order. If you believe this is a
                  mistake, contact us at{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </>
              )}
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/account">
                {isVi ? "Xem lịch sử đơn hàng" : "View My Orders"}
              </Link>
            </Button>
          </div>
        )}
      </Container>
    </div>
  );
}
