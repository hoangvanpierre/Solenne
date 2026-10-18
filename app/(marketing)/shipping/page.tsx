import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { CONTACT_EMAIL, SHIPPING } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Shipping & Returns — Solenne",
  description:
    "Solenne shipping and returns: dispatch times, delivery estimates, rates, and our 30-day return policy.",
};

export default async function ShippingPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const shippingRows = [
    {
      label: isVi
        ? "Giao hàng tiêu chuẩn trang trọng (3-5 ngày làm việc)"
        : "Standard shipping (3-5 business days)",
      usd: formatPrice(SHIPPING.flatRateUSD, "USD"),
      vnd: formatPrice(SHIPPING.flatRateVND, "VND"),
    },
    {
      label: isVi
        ? `Trân quý miễn phí vận chuyển cho đơn hàng từ ${formatPrice(SHIPPING.freeThresholdUSD, "USD")} (${formatPrice(SHIPPING.freeThresholdVND, "VND")})`
        : `Free shipping on orders over ${formatPrice(SHIPPING.freeThresholdUSD, "USD")} (${formatPrice(SHIPPING.freeThresholdVND, "VND")})`,
      usd: isVi ? "Miễn phí" : "Free",
      vnd: isVi ? "Miễn phí" : "Free",
    },
  ];

  const returnSteps = [
    {
      title: isVi ? "Liên hệ Nhà hương" : "Contact us",
      body: isVi
        ? `Gửi thư tới ${CONTACT_EMAIL} trong vòng 30 ngày kể từ khi nhận nến, kèm mã đơn hàng và lý do đổi trả. Nếu tác phẩm gặp sự cố khi vận chuyển, xin quý khách đính kèm hình ảnh.`
        : `Email ${CONTACT_EMAIL} within 30 days of delivery with your order number and reason for the return. For damaged or faulty candles, please include a photo.`,
    },
    {
      title: isVi ? "Đóng gói tác phẩm" : "Prepare the candle",
      body: isVi
        ? "Đặt nến cẩn trọng trong ly thủy tinh và vỏ hộp nguyên bản. Những tác phẩm chưa thắp sáng, nguyên vẹn đủ điều kiện hoàn trả 100% giá trị."
        : "Pack the candle securely in its original vessel and box. Unopened, unused candles in resalable condition are eligible for a full refund.",
    },
    {
      title: isVi ? "Gửi về xưởng thủ công" : "Ship it back",
      body: isVi
        ? "Chúng tôi sẽ gửi chỉ dẫn gửi hàng chi tiết. Khi tác phẩm về tới xưởng, khoản tiền hoàn lại sẽ được xử lý trong vòng 5 ngày làm việc qua phương thức thanh toán ban đầu."
        : "We'll reply with a return authorization and instructions. Once the candle reaches the studio, refunds are issued within 5 business days to the original payment method.",
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-14">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Giao Nhận & Đổi Trả" : "Shipping & Returns"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed font-normal">
            {isVi
              ? "Mỗi kiện nến thơm đều được gói ghém bằng cả tấm lòng tại xưởng và gửi đi trong vòng 1-2 ngày làm việc."
              : "Every order is wrapped with care in the studio and dispatched within 1-2 business days."}
          </p>
        </div>

        <section className="mb-14">
          <h2 className="font-serif text-xl sm:text-2xl font-normal leading-[1.28] mb-5 text-foreground">
            {isVi ? "Biểu Phí & Thời Gian Giao Nhận" : "Rates & Delivery"}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border">
            {shippingRows.map((row, index) => (
              <div
                key={index}
                className={`flex flex-col sm:flex-row sm:items-center justify-between p-5 sm:p-6 gap-2 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <span className="text-foreground font-normal text-[14px] sm:text-[14.5px]">{row.label}</span>
                <div className="flex gap-4 text-[13px] text-muted-foreground font-normal tabular-nums">
                  <span>{row.usd}</span>
                  <span>/</span>
                  <span>{row.vnd}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-serif text-xl sm:text-2xl font-normal leading-[1.28] mb-5 text-foreground">
            {isVi ? "Chính Sách Đổi Trả trong 30 Ngày" : "Our 30-Day Return Policy"}
          </h2>
          <ol className="space-y-7">
            {returnSteps.map((step, index) => (
              <li key={index} className="flex gap-5 sm:gap-6">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted font-serif font-normal tabular-nums text-foreground">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-serif text-base sm:text-[17px] font-normal text-foreground leading-[1.3]">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] sm:text-[14px] text-muted-foreground leading-[1.65] font-normal">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </Container>
    </div>
  );
}
