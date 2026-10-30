import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Candle Care Guide — Solenne",
  description:
    "How to care for a Solenne candle: the first burn, wick trimming, burn length, and safe extinguishing, for the fullest scent and longest life.",
};

export default async function CareGuidePage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  const steps = [
    {
      title: isVi ? "Cắt bấc" : "Trim the wick",
      body: isVi
        ? "Trước mỗi lần thắp, cắt bấc còn khoảng 0,6 cm. Bấc ngắn giữ ngọn lửa thấp và sạch, không tạo muội, và giúp sáp tan đều khắp mặt ly."
        : "Before every burn, trim the wick to about a quarter inch. A short wick keeps the flame low and clean, prevents soot, and helps the wax melt evenly across the vessel.",
    },
    {
      title: isVi
        ? "Để lần thắp đầu tan tới mép ly"
        : "Let the first burn reach the edge",
      body: isVi
        ? "Sáp đậu nành có trí nhớ. Trong lần thắp đầu, hãy để mặt sáp tan chảy tới mép ly, thường mất 2–3 giờ. Điều này ngăn hiện tượng lõm tim và giúp nến cháy phẳng suốt vòng đời."
        : "Soy wax has a memory. On the first burn, let the melt pool reach the edge of the vessel — usually 2–3 hours. This prevents tunnelling and sets the candle up to burn evenly for the rest of its life.",
    },
    {
      title: isVi ? "Thắp theo từng đợt" : "Burn in sessions",
      body: isVi
        ? "Mỗi lần thắp không quá 4 giờ, và để sáp nguội hẳn trước khi thắp lại. Thắp quá lâu làm tinh dầu quá nhiệt và khiến hương nhạt đi."
        : "Keep each burn under 4 hours and let the wax cool fully before relighting. Longer sessions overheat the fragrance oil and dull the scent.",
    },
    {
      title: isVi ? "Dập tắt, đừng thổi" : "Snuff, don't blow",
      body: isVi
        ? "Dập tắt bằng chuông dập nến hoặc thìa kim loại giữ hương lại trong sáp thay vì để hương tan theo khói."
        : "Snuffing the flame traps the fragrance in the wax instead of scattering it as smoke. A wick dipper or a metal spoon both work well.",
    },
    {
      title: isVi ? "Cân bấc và làm sạch" : "Center and clean",
      body: isVi
        ? "Khi sáp đã nguội, nhẹ nhàng đưa bấc về giữa và nhặt bỏ phần bấc vụn trên mặt sáp. Bấc vụn có thể bắt lửa và làm ngọn lửa bùng lên."
        : "While the wax is cool, gently recenter the wick and remove any trimmings or debris from the melt pool. Debris can catch and flare.",
    },
    {
      title: isVi ? "Biết lúc nên dừng" : "Know when to stop",
      body: isVi
        ? "Ngừng thắp khi còn khoảng 1,2 cm sáp dưới đáy ly để tránh làm nóng ly thủy tinh. Rửa ly bằng nước ấm và xà phòng nhẹ, rồi dùng lại cho việc khác."
        : "Stop burning when about half an inch of wax remains, to avoid overheating the glass. Wash the jar with warm, soapy water and give it a second life.",
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-14">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Cách chăm sóc nến" : "Candle care"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base leading-relaxed font-normal">
            {isVi
              ? "Nến được chăm đúng cách sẽ cháy lâu hơn. Sáu thói quen nhỏ để giữ trọn hương và kéo dài tuổi thọ của nến."
              : "A candle cared for lasts longer. Six small habits for the fullest scent and the longest life."}
          </p>
        </div>

        <ol className="space-y-8">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-5 sm:gap-6">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-muted font-serif text-base font-normal tabular-nums text-foreground">
                {index + 1}
              </span>
              <div>
                <h2 className="font-serif text-base sm:text-lg font-normal text-foreground leading-[1.3]">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-[14px] sm:text-[14.5px] leading-[1.7] text-muted-foreground font-normal">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-14 rounded-2xl border border-border p-6 sm:p-8">
          <h2 className="font-serif text-lg font-normal mb-2 text-foreground">
            {isVi ? "An toàn là trên hết" : "Safety first"}
          </h2>
          <p className="text-[13.5px] leading-[1.65] text-muted-foreground font-normal">
            {isVi
              ? "Không để nến cháy mà không trông coi. Giữ nến xa gió, trẻ nhỏ và thú cưng. Luôn thắp trên bề mặt phẳng, chịu nhiệt, cách xa tường và rèm."
              : "Never leave a burning candle unattended. Keep it away from drafts, children and pets. Burn on a stable, heat-resistant surface, away from walls and curtains."}
          </p>
        </section>
      </Container>
    </div>
  );
}
