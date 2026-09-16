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
      title: isVi
        ? "Cắt tỉa bấc nến — Nghi thức trước khi thắp lửa"
        : "Trim the wick",
      body: isVi
        ? "Trước mỗi lần thắp sáng, hãy cắt tỉa bấc nến còn khoảng 0.6cm. Sợi bấc ngắn giúp ngọn lửa cháy êm ả, trong trẻo, không tạo muội than và giúp sáp tan chảy đều đặn khắp bề mặt ly."
        : "Before every burn, trim the wick to a quarter inch. A short wick keeps the flame low and clean, prevents soot, and helps the wax melt evenly across the vessel.",
    },
    {
      title: isVi
        ? "Để sáp tan chạm mép ly — Ký ức của sáp đậu nành"
        : "Let the first burn reach the edge",
      body: isVi
        ? "Sáp đậu nành luôn mang một ký ức sâu đậm. Trong lần thắp đầu tiên, hãy kiên nhẫn để bề mặt sáp tan chảy hoàn toàn đến tận mép ly (thường từ 2-3 giờ). Nghi thức này ngăn ngừa hiện tượng lõm tim và giữ cho nến cháy phẳng mịn suốt vòng đời."
        : "Soy wax has a memory. On the first burn, let the melt pool reach the edge of the vessel, usually 2-3 hours. This prevents tunneling and sets the candle up to burn evenly for its whole life.",
    },
    {
      title: isVi
        ? "Thắp theo từng nhịp sống — Trân quý tinh hương"
        : "Burn in sessions",
      body: isVi
        ? "Mỗi lần thắp nến không nên quá 4 giờ và hãy để sáp nguội hẳn trước khi thắp lại. Thắp quá lâu sẽ làm tinh dầu bị quá nhiệt và làm nhạt phai vẻ đẹp nguyên bản của hương thơm."
        : "Keep each burn under 4 hours and let the wax cool fully before relighting. Longer sessions overheat the fragrance oil and dull the scent.",
    },
    {
      title: isVi
        ? "Dập tắt êm đềm, đừng thổi tắt — Lưu giữ tinh túy"
        : "Snuff, don't blow",
      body: isVi
        ? "Dùng chuông dập nến hoặc muỗng kim loại để dập tắt ngọn lửa giúp giam giữ trọn vẹn tinh dầu trong sáp thay vì để hương thơm tan biến theo làn khói. Một cử chỉ tĩnh tại khép lại một buổi tối an yên."
        : "Snuffing the flame traps the fragrance in the wax instead of scattering it as smoke. A wick dipper or a metal spoon both work beautifully.",
    },
    {
      title: isVi
        ? "Cân chỉnh và thanh tẩy — Giữ gìn cõi sáng"
        : "Center and clean",
      body: isVi
        ? "Khi sáp đã nguội, hãy nhẹ nhàng cân chỉnh lại sợi bấc về chính tâm và nhặt bỏ phần bấc vụn khỏi bề mặt nến để ngọn lửa luôn tinh khiết trong lần thắp sau."
        : "While the wax is cool, gently recenter the wick and remove any wick trimmings or debris from the melt pool. Debris can catch and flare.",
    },
    {
      title: isVi
        ? "Thời khắc chia tay — Trao gửi một cuộc đời mới"
        : "Know when to say goodbye",
      body: isVi
        ? "Hãy ngừng thắp khi lượng sáp dưới đáy ly còn khoảng 1.2cm để tránh ly thủy tinh quá nóng. Rửa sạch ly bằng nước ấm và xà phòng nhẹ, chiếc ly thanh lịch sẽ tiếp tục đồng hành cùng bạn như một chiếc cắm cọ, cắm hoa hay đựng bảo vật."
        : "Stop burning when a half inch of wax remains. Burning lower risks overheating the vessel. Clean it with warm, soapy water and give the jar a second life.",
    },
  ];

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            {isVi ? "Nghi Thức Chăm Sóc Nến" : "Candle Care Guide"}
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {isVi
              ? "Một ngọn nến được nâng niu là một ngọn nến tỏa rạng dài lâu. Sáu nghi thức nhỏ để lưu giữ trọn vẹn hương sắc và kéo dài thanh xuân của ngọn lửa."
              : "A candle cared for is a candle that lasts. Six small rituals for the fullest scent and the longest life."}
          </p>
        </div>

        <ol className="space-y-10">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-6">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-muted font-serif text-lg font-semibold text-foreground">
                {index + 1}
              </span>
              <div>
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  {step.title}
                </h2>
                <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <section className="mt-16 rounded-2xl border border-border p-8">
          <h2 className="font-serif text-xl font-semibold mb-3 text-foreground">
            {isVi ? "An toàn là trên hết" : "Safety first"}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {isVi
              ? "Tuyệt đối không để nến cháy ngoài tầm mắt. Đặt nến tránh xa luồng gió, trẻ nhỏ và thú cưng. Luôn thắp nến trên bề mặt phẳng chịu nhiệt, và giữ khoảng cách an toàn với rèm cửa hoặc vật dễ bắt lửa."
              : "Never leave a burning candle unattended. Keep away from drafts, children, and pets. Always burn on a stable, heat-resistant surface, and keep the flame away from walls and curtains."}
          </p>
        </section>
      </Container>
    </div>
  );
}
