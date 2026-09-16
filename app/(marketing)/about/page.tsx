import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About — Solenne",
  description:
    "The story behind Solenne: small-batch artisan candles crafted with intention, honest ingredients, and a lighter footprint.",
};

export default async function AboutPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const sections = [
    {
      id: "craft",
      title: isVi ? "Nghệ thuật đúc nến chậm rãi" : "Our Craft",
      paragraphs: isVi
        ? [
            "Mỗi tác phẩm Solenne bắt đầu trong xưởng thủ công tĩnh mịch, nơi từng mẻ nến nhỏ được đổ tay với sự điềm đạm vô song. Chúng tôi làm việc chậm rãi, bởi chúng tôi hiểu rằng sự xa xỉ đích thực không bao giờ có thể vội vã.",
            "Từ việc cân chỉnh bấc nến đến nhát cắt tỉa cuối cùng, mỗi công đoạn đều tuân theo nghi thức lâu đời: kiểm soát nghiêm ngặt nhiệt độ rót, bấc bông dệt không chì và tròn mười bốn ngày ủ hương trước khi tác phẩm đủ tư cách tỏa sáng trong ngôi nhà bạn.",
          ]
        : [
            "Every Solenne candle begins in our studio, where small batches are poured by hand. We work slowly and deliberately, because a candle made in a hurry is easy to smell.",
            "From wick trimming to cure time, each step follows the same ritual: slow pours, careful temperature control, and two full weeks of curing before a candle is good enough to leave our hands.",
          ],
    },
    {
      id: "ingredients",
      title: isVi ? "Nguyên liệu thanh khiết & Cao quý" : "Our Ingredients",
      paragraphs: isVi
        ? [
            "Chúng tôi sử dụng 100% sáp đậu nành tự nhiên, bấc cotton thuần khiết và tinh dầu hương thực vật được hòa quyện tại Grasse, kinh đô nước hoa của Pháp — tuyệt đối không chứa phthalate hay phụ phẩm dầu mỏ độc hại.",
            "Mỗi bản hòa tấu hương thơm hé lộ qua ba tầng biến chuyển: nốt khởi hương thanh thoát khẽ chào đón, nốt tâm hương nồng nàn vương vấn suốt đêm dài, và nốt hương nền lắng đọng vấn vương mãi trong căn phòng ngay cả khi ngọn lửa đã say ngủ.",
          ]
        : [
            "We use 100% natural soy wax, cotton wicks, and premium fragrance oils blended without phthalates. Nothing you wouldn't want burning in your own home.",
            "Each scent is composed in three movements: top notes that greet you, heart notes that linger, and base notes that stay long after the flame is out.",
          ],
    },
    {
      id: "sustainability",
      title: isVi ? "Tấm lòng tri ân Mẹ thiên nhiên" : "Our Footprint",
      paragraphs: isVi
        ? [
            "Những chiếc ly thủy tinh dày dặn được tạo ra để nâng niu, rồi tái sinh cho những công năng mới. Từng vỏ hộp, hộp giấy và dải ruy-băng đều có nguồn gốc bền vững và có thể tái chế trọn vẹn.",
            "Chúng tôi bù trừ lượng khí thải trong vận chuyển và giữ cho bao bì tối giản, không nhựa — bởi vẻ đẹp tinh tế thanh tao không cần bất cứ điều gì để giấu giếm.",
          ]
        : [
            "Our vessels are designed to be relished, then reused. Every jar, tin, and box is recyclable, and our soy wax is sourced from renewable, American-grown soybeans.",
            "We offset shipping emissions and keep packaging minimal, because the luxury we're after has nothing to hide.",
          ],
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <header className="mb-20">
          <p className="mb-4 text-sm uppercase tracking-[0.3em] text-muted-foreground">
            {isVi ? "Di sản & Nghệ thuật chế tác" : "Our Story"}
          </p>
          <h1 className="font-serif text-4xl md:text-6xl font-semibold mb-6 text-foreground">
            {isVi
              ? "Ba mươi năm thắp sáng, tĩnh lặng và ướp hương."
              : "Crafted with intention. Born from nature."}
          </h1>
          <p className="text-lg leading-relaxed text-muted-foreground">
            {isVi
              ? "Solenne được khai sinh từ một suy tưởng mộc mạc: một ngọn nến không đơn thuần là mùi hương. Đó là một nghi thức tĩnh tại, được tạo tác chân thực từ tinh hoa đất trời để tôn vinh chốn an trú của tâm hồn."
              : "Solenne began with a simple belief: that a candle should be more than a scent. It should be a moment of peace, made honestly, from materials that respect the home it burns in and the world it comes from."}
          </p>
        </header>

        <div className="space-y-20">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="font-serif text-3xl font-semibold mb-6 text-foreground">
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p
                  key={paragraph.slice(0, 24)}
                  className="mb-4 text-base leading-relaxed text-muted-foreground"
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
              {isVi ? "Khám phá bộ sưu tập nến" : "Explore the Collection"}
            </Link>
          </Button>
        </div>
      </Container>
    </div>
  );
}
