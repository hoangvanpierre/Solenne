import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "FAQ — Solenne",
  description:
    "Answers to common questions about Solenne candles: orders, shipping, returns, candle care, and wholesale.",
};

export default async function FaqPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const faqs = [
    {
      question: isVi
        ? "Nến thơm Solenne có thời gian tỏa sáng trong bao lâu?"
        : "How long do Solenne candles burn?",
      answer: isVi
        ? "Thời gian thắp sáng phụ thuộc vào dung tích của từng chiếc ly, dao động từ khoảng 25 giờ cho các tác phẩm nhỏ đến hơn 60 giờ cho những hũ nến đại. Khi được chăm sóc theo đúng nghi thức, nến sẽ cháy tinh khiết, sạch sẽ và trọn vẹn đến từng giọt sáp cuối cùng."
        : "Burn time depends on the size of the vessel, ranging from roughly 25 hours for our smallest to 60 hours for our largest. Each product page lists the exact burn time. With proper care, a candle should burn cleanly to its final hour.",
    },
    {
      question: isVi
        ? "Vì sao cần cắt ngắn bấc nến trước mỗi lần thắp?"
        : "Why should I trim the wick before each burn?",
      answer: isVi
        ? "Cắt tỉa bấc nến còn khoảng 0.6 cm giúp ngọn lửa cháy nhỏ, êm đềm và vững vàng, ngăn ngừa khói muội và giúp sáp tan chảy phẳng mịn như gương. Một sợi bấc quá dài sẽ khiến ngọn lửa quá nóng, làm thoái hóa tinh dầu hương và rút ngắn thanh xuân của ngọn nến."
        : "Trimming the wick to about a quarter inch keeps the flame low and steady, prevents soot, and helps the wax melt evenly. A long wick burns too hot, which shortens the life of the candle and dulls the scent.",
    },
    {
      question: isVi
        ? "Thời gian chuẩn bị và vận chuyển mất bao lâu?"
        : "How long does shipping take?",
      answer: isVi
        ? "Mỗi đơn hàng được chuẩn bị và gói ghém thủ công tại xưởng trong vòng 1-2 ngày làm việc. Quá trình giao hàng nội địa thường mất từ 2-4 ngày. Quý khách sẽ nhận được mã vận đơn định vị ngay khi tác phẩm rời xưởng."
        : "Orders are prepared within 1-2 business days. Domestic delivery typically takes 3-5 business days after dispatch. You'll receive a tracking link as soon as your order leaves the studio.",
    },
    {
      question: isVi
        ? "Chính sách đổi trả tác phẩm của Nhà hương ra sao?"
        : "What is your return policy?",
      answer: isVi
        ? "Những ngọn nến chưa mở nắp và nguyên vẹn có thể đổi trả trong vòng 30 ngày kể từ ngày nhận. Nếu tác phẩm gặp sự cố trong quá trình vận chuyển, quý khách chỉ cần liên hệ kèm hình ảnh và mã đơn hàng, chúng tôi sẽ trân trọng hỗ trợ quý khách ngay lập tức."
        : "Unopened candles may be returned within 30 days of delivery for a full refund. If a candle arrives damaged or seems faulty, contact us with a photo and your order number and we'll make it right.",
    },
    {
      question: isVi
        ? "Nhà hương có dịch vụ gói quà nghệ thuật không?"
        : "Do you offer gift wrapping?",
      answer: isVi
        ? "Có. Dịch vụ gói quà thủ công với hộp cứng sang trọng, ruy băng nhung và thiệp viết tay trang trọng luôn sẵn sàng phục vụ quý khách tại trang thanh toán."
        : "Yes. Gift wrapping is available at checkout for a small fee, and you can include a handwritten note with your gift order at no extra charge.",
    },
    {
      question: isVi
        ? "Nến thơm Solenne có an toàn cho thú cưng không?"
        : "Are your candles safe around pets?",
      answer: isVi
        ? "Nến của chúng tôi hoàn toàn đúc từ sáp đậu nành tự nhiên và tinh dầu tinh khiết không phthalate. Tuy nhiên, quý khách nên thắp nến ở nơi thoáng khí, giữ ngọn lửa xa tầm với của các bé và không bao giờ để nến cháy khi vắng nhà."
        : "Our candles use natural soy wax and phthalate-free fragrance oils, but no scented candle should be left burning unattended near pets. Always burn in a ventilated room, keep flames out of reach, and never leave a candle lit while away.",
    },
    {
      question: isVi
        ? "Nhà hương có giao hàng quốc tế không?"
        : "Do you ship internationally?",
      answer: isVi
        ? "Hiện tại chúng tôi phục vụ giao hàng trang trọng tại Việt Nam và Hoa Kỳ. Quý khách có thể đăng ký nhận thư để cập nhật khi chúng tôi mở rộng sang các quốc gia khác."
        : "We currently ship within the United States and Vietnam. Sign up for our newsletter to hear when we add new regions.",
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            {isVi ? "Những Câu Hỏi Thường Gặp" : "Frequently Asked Questions"}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {isVi ? (
              <>
                Những điều khách quý thường băn khoăn khi tìm đến Solenne. Chưa
                thấy lời giải đáp của bạn?{" "}
                <Link
                  href="/contact"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  Hãy viết thư cho chúng tôi
                </Link>
                .
              </>
            ) : (
              <>
                Everything we&apos;re most often asked. Can&apos;t find your
                answer?{" "}
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
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                <span className="font-serif text-lg">{faq.question}</span>
                <span className="text-xl text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </Container>
    </div>
  );
}
