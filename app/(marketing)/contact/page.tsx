import type { Metadata } from "next";
import { Mail, MapPin, Clock } from "lucide-react";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { ContactForm } from "@/components/sections";
import { CONTACT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact — Solenne",
  description:
    "Questions about an order, a scent, or a gift? Write to the Solenne studio and we'll reply within two business days.",
};

export default async function ContactPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const contactCards = [
    {
      icon: Mail,
      title: isVi ? "Thư điện tử" : "Email",
      lines: [
        CONTACT_EMAIL,
        isVi
          ? "Phản hồi trang trọng trong 2 ngày làm việc."
          : "We reply within two business days.",
      ],
    },
    {
      icon: MapPin,
      title: isVi ? "Xưởng chế tác" : "Studio",
      lines: [
        isVi ? "Xưởng thủ công Solenne" : "Solenne Studio",
        isVi ? "Đón tiếp theo lịch hẹn riêng." : "By appointment only.",
      ],
    },
    {
      icon: Clock,
      title: isVi ? "Thời gian đón tiếp" : "Hours",
      lines: [
        isVi ? "Thứ Hai đến Thứ Sáu" : "Monday to Friday",
        "9:00 – 17:00 (GMT+7)",
      ],
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-5xl">
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            {isVi ? "Liên hệ Nhà hương" : "Contact"}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl leading-relaxed">
            {isVi
              ? "Dù là một băn khoăn về đơn hàng, nốt hương quý khách đang kiếm tìm, hay món quà gửi trao người thương, chúng tôi luôn ở đây để lắng nghe."
              : "Whether it's a question about an order, a scent you're searching for, or a gift you'd like help choosing, we'd love to hear from you."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
          <div className="space-y-8 lg:col-span-2">
            {contactCards.map(({ icon: Icon, title, lines }) => (
              <div key={title} className="flex gap-4">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-muted">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-foreground">
                    {title}
                  </h2>
                  {lines.map((line) => (
                    <p key={line} className="text-sm text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isVi
                ? "Đối với các câu hỏi về đơn hàng cụ thể, quý khách vui lòng kèm theo mã đơn hàng để chúng tôi hỗ trợ nhanh nhất."
                : "For order-specific questions, please include your order number so we can help you faster."}
            </p>
          </div>

          <div className="lg:col-span-3">
            <ContactForm />
          </div>
        </div>
      </Container>
    </div>
  );
}
