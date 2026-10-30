import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "FAQ — Solenne",
  description:
    "Answers to common questions about Solenne candles: orders, shipping, returns, gift wrapping and candle care.",
};

export default async function FaqPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const faqs = [
    {
      question: isVi
        ? "Nến Solenne cháy được bao lâu?"
        : "How long do Solenne candles burn?",
      answer: isVi
        ? "Thời gian cháy phụ thuộc vào dung tích ly: khoảng 25 giờ với cỡ nhỏ nhất và 60 giờ với cỡ lớn nhất. Mỗi trang sản phẩm ghi con số cụ thể. Chăm sóc đúng cách, nến sẽ cháy sạch đến giờ cuối cùng."
        : "Burn time depends on the size of the vessel: roughly 25 hours for the smallest, 60 hours for the largest. Each product page lists the exact figure. Cared for properly, a candle burns cleanly to its last hour.",
    },
    {
      question: isVi
        ? "Vì sao cần cắt bấc trước mỗi lần thắp?"
        : "Why should I trim the wick before each burn?",
      answer: isVi
        ? "Cắt bấc còn khoảng 0,6 cm giúp ngọn lửa thấp và đều, không tạo muội, và giúp sáp tan chảy phẳng. Bấc quá dài làm lửa nóng, khiến hương nhạt đi và rút ngắn tuổi thọ của nến."
        : "A wick trimmed to about a quarter inch keeps the flame low and steady, prevents soot, and helps the wax melt evenly. A long wick burns too hot, which dulls the scent and shortens the life of the candle.",
    },
    {
      question: isVi ? "Giao hàng mất bao lâu?" : "How long does shipping take?",
      answer: isVi
        ? "Đơn hàng được chuẩn bị trong 1–2 ngày làm việc. Giao hàng nội địa thường mất 3–5 ngày làm việc sau khi gửi. Bạn sẽ nhận mã theo dõi ngay khi đơn rời xưởng."
        : "Orders are prepared within 1–2 business days. Domestic delivery usually takes 3–5 business days after dispatch. You'll receive a tracking link as soon as your order leaves the studio.",
    },
    {
      question: isVi ? "Chính sách đổi trả thế nào?" : "What is your return policy?",
      answer: isVi
        ? "Nến chưa mở và còn nguyên vẹn có thể đổi trả trong 30 ngày kể từ ngày nhận để được hoàn tiền đầy đủ. Nếu nến đến bị hỏng hoặc có lỗi, hãy liên hệ kèm ảnh và mã đơn hàng, chúng tôi sẽ xử lý."
        : "Unopened candles can be returned within 30 days of delivery for a full refund. If a candle arrives damaged or seems faulty, contact us with a photo and your order number and we'll put it right.",
    },
    {
      question: isVi ? "Có gói quà không?" : "Do you offer gift wrapping?",
      answer: isVi
        ? "Có. Gói quà có sẵn khi thanh toán với một khoản phí nhỏ, và bạn có thể thêm thiệp viết tay cho đơn quà mà không mất thêm phí."
        : "Yes. Gift wrapping is available at checkout for a small fee, and you can add a handwritten note to a gift order at no extra charge.",
    },
    {
      question: isVi
        ? "Nến có an toàn với thú cưng không?"
        : "Are your candles safe around pets?",
      answer: isVi
        ? "Nến dùng sáp đậu nành tự nhiên và tinh dầu không chứa phthalate, nhưng không nên để nến cháy mà không trông coi gần thú cưng. Hãy thắp ở nơi thoáng, để ngọn lửa xa tầm với và không để nến cháy khi ra khỏi nhà."
        : "Our candles use natural soy wax and phthalate-free fragrance oils, but no scented candle should burn unattended near pets. Burn in a ventilated room, keep flames out of reach, and never leave a candle lit while you're away.",
    },
    {
      question: isVi
        ? "Có giao hàng quốc tế không?"
        : "Do you ship internationally?",
      answer: isVi
        ? "Hiện chúng tôi giao hàng tại Việt Nam và Hoa Kỳ. Đăng ký nhận tin để biết khi có thêm quốc gia."
        : "We currently ship within Vietnam and the United States. Join the newsletter to hear when we add new regions.",
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-14">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Câu hỏi thường gặp" : "Frequently asked questions"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed font-normal">
            {isVi ? (
              <>
                Những câu hỏi chúng tôi nhận nhiều nhất. Chưa thấy câu trả lời?{" "}
                <Link
                  href="/contact"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Viết cho chúng tôi
                </Link>
                .
              </>
            ) : (
              <>
                The questions we&apos;re asked most. Can&apos;t find your answer?{" "}
                <Link
                  href="/contact"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Write to us
                </Link>
                .
              </>
            )}
          </p>
        </div>

        <div className="divide-y divide-border">
          {faqs.map((faq) => (
            <details key={faq.question} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-normal text-foreground [&::-webkit-details-marker]:hidden">
                <span className="font-serif text-base sm:text-[17px] font-normal leading-[1.35]">{faq.question}</span>
                <span className="text-xl text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[14px] sm:text-[14.5px] text-muted-foreground leading-[1.7] font-normal">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </div>
  );
}
