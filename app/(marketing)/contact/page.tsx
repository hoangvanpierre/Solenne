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
      title: isVi ? "Email" : "Email",
      lines: [
        CONTACT_EMAIL,
        isVi
          ? "Phản hồi trong hai ngày làm việc."
          : "We reply within two business days.",
      ],
    },
    {
      icon: MapPin,
      title: isVi ? "Xưởng" : "Studio",
      lines: [
        isVi ? "Xưởng Solenne" : "Solenne Studio",
        isVi ? "Đến thăm theo lịch hẹn." : "By appointment only.",
      ],
    },
    {
      icon: Clock,
      title: isVi ? "Giờ mở cửa" : "Hours",
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
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Liên hệ" : "Contact"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl font-normal leading-relaxed">
            {isVi
              ? "Bạn có câu hỏi về đơn hàng, một mùi hương hay một món quà? Viết cho xưởng, chúng tôi sẽ phản hồi trong hai ngày làm việc."
              : "Questions about an order, a scent, or a gift? Write to the studio and we'll reply within two business days."}
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
                  <h2 className="font-serif text-base font-normal text-foreground leading-[1.3]">
                    {title}
                  </h2>
                  {lines.map((line) => (
                    <p key={line} className="text-[13px] text-muted-foreground font-normal">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[13px] text-muted-foreground font-normal leading-relaxed">
              {isVi
                ? "Với câu hỏi về một đơn hàng cụ thể, hãy kèm mã đơn hàng để chúng tôi hỗ trợ nhanh hơn."
                : "For order-specific questions, include your order number so we can help you faster."}
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
