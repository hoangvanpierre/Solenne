import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About — Solenne",
  description:
    "The story behind Solenne: hand-poured scented candles made in small batches, with natural soy wax and fragrance composed in Grasse.",
};

export default async function AboutPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const sections = [
    {
      id: "craft",
      title: isVi ? "Đổ chậm, bằng tay" : "Poured slowly, by hand",
      paragraphs: isVi
        ? [
            "Nến được đổ tại xưởng theo từng mẻ nhỏ. Chúng tôi làm chậm, vì một ngọn nến làm vội sẽ dễ nhận ra ngay từ mùi hương.",
            "Từ lúc cắt bấc đến thời gian ủ hương, mỗi bước theo cùng một quy trình: rót chậm, kiểm soát nhiệt độ cẩn thận và tròn hai tuần ủ trước khi nến rời xưởng.",
          ]
        : [
            "Every candle is poured in our studio in small batches. We work slowly, because a candle made in a hurry is easy to smell.",
            "From wick trimming to cure time, each step follows the same routine: slow pours, careful temperature control, and two full weeks of curing before a candle leaves the studio.",
          ],
    },
    {
      id: "ingredients",
      title: isVi ? "Nguyên liệu" : "What goes in",
      paragraphs: isVi
        ? [
            "Chúng tôi dùng 100% sáp đậu nành tự nhiên, bấc cotton và tinh dầu hương pha chế không chứa phthalate. Chỉ những nguyên liệu bạn sẽ thấy ổn khi đốt trong nhà.",
            "Mỗi mùi hương mở ra theo ba tầng: hương đầu chào đón, hương giữa vương lại, và hương nền ở lại sau khi ngọn lửa đã tắt.",
          ]
        : [
            "We use 100% natural soy wax, cotton wicks, and fragrance oils blended without phthalates. Nothing you wouldn't want burning in your own home.",
            "Each scent opens in three stages: top notes that greet you, heart notes that linger, and a base that stays after the flame is out.",
          ],
    },
    {
      id: "sustainability",
      title: isVi ? "Môi trường" : "Our footprint",
      paragraphs: isVi
        ? [
            "Ly nến được làm để giữ lại rồi dùng tiếp. Mỗi chiếc hũ, hộp thiếc và hộp giấy đều tái chế được, và sáp đậu nành đến từ nguồn tái tạo trồng tại Hoa Kỳ.",
            "Chúng tôi bù trừ khí thải vận chuyển và giữ bao bì tối giản. Ở đây không có gì để che giấu.",
          ]
        : [
            "Our vessels are made to be kept, then reused. Every jar, tin and box is recyclable, and our soy wax comes from renewable, American-grown soybeans.",
            "We offset shipping emissions and keep packaging minimal. There is nothing here to hide.",
          ],
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <header className="mb-20">
          <p className="mb-3 text-[10.5px] sm:text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-normal">
            {isVi ? "Di sản & Nghệ thuật chế tác" : "Our Story"}
          </p>
          <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal leading-[1.22] mb-5 text-foreground">
            {isVi
              ? "Ba mươi năm thắp sáng, tĩnh lặng và ướp hương."
              : "Crafted with intention. Born from nature."}
          </h1>
          <p className="text-sm sm:text-base leading-[1.7] text-muted-foreground font-normal">
            {isVi
              ? "Solenne được khai sinh từ một suy tưởng mộc mạc: một ngọn nến không đơn thuần là mùi hương. Đó là một nghi thức tĩnh tại, được tạo tác chân thực từ tinh hoa đất trời để tôn vinh chốn an trú của tâm hồn."
              : "Solenne began with a simple belief: that a candle should be more than a scent. It should be a moment of peace, made honestly, from materials that respect the home it burns in and the world it comes from."}
          </p>
        </header>

        <div className="space-y-16">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="font-serif text-xl sm:text-2xl font-normal leading-[1.28] mb-4 text-foreground">
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className="mb-4 text-[14px] sm:text-[15px] leading-[1.7] text-muted-foreground font-normal"
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-20 border-t border-border pt-12">
          <Button asChild size="lg">
            <Link href="/products">
              {isVi ? "Khám phá bộ sưu tập" : "Explore the collection"}
            </Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
