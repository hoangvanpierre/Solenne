import Link from "next/link";
import { getLocale } from "next-intl/server";
import { ArrowLeft, Sparkles } from "lucide-react";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const isVi = locale === "vi";

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-12 bg-background">
      {/* Left: Atmospheric Brand Story Panel (Desktop) */}
      <div className="hidden lg:flex lg:col-span-5 xl:col-span-6 relative flex-col justify-between p-12 bg-warm-black text-cream overflow-hidden">
        {/* Ambient background glow & pattern */}
        <div className="absolute inset-0 bg-radial-at-c from-amber/15 via-warm-black/80 to-warm-black z-0 pointer-events-none" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-amber/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-sage/10 blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-serif text-2xl tracking-wider font-semibold text-cream hover:opacity-80 transition-opacity"
          >
            SOLENNE
          </Link>
          <p className="text-xs uppercase tracking-[0.25em] text-cream/60 mt-1 font-sans">
            {isVi ? "Nến thơm nghệ nhân thủ công" : "Artisan Scented Candles"}
          </p>
        </div>

        {/* Center Quote & Craft Narrative */}
        <div className="relative z-10 max-w-md my-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs tracking-wide">
            <Sparkles className="w-3 h-3" />
            <span>{isVi ? "Góc riêng tĩnh tại Solenne" : "The Solenne Sanctuary"}</span>
          </div>

          <blockquote className="font-script text-4xl xl:text-5xl font-normal leading-relaxed text-amber-light/95">
            {isVi
              ? "“Mỗi ngọn nến đong đầy tâm niệm, mang hơi ấm dịu dàng và cõi an yên thuần khiết vào chốn thiêng liêng của bạn.”"
              : "“Candles poured with intention, casting warmth and serene peace into your sacred space.”"}
          </blockquote>

          <p className="text-sm text-cream/70 leading-relaxed font-sans">
            {isVi
              ? "Đăng nhập để theo dõi tác phẩm đang chế tác, lưu giữ nốt hương bản sắc và thỉnh nến với trải nghiệm trang trọng."
              : "Sign in to track your artisanal orders, save your favorite bespoke scents, and enjoy seamless expedited checkout."}
          </p>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-cream/50 flex items-center justify-between font-sans">
          <span>{isVi ? "Đổ tay thủ công từng mẻ nhỏ" : "Hand-poured in small batches"}</span>
          <span>{isVi ? "100% Sáp đậu nành & Tinh dầu thiên nhiên" : "100% Natural Soy & Botanicals"}</span>
        </div>
      </div>

      {/* Right: Auth Form Container */}
      <div className="col-span-1 lg:col-span-7 xl:col-span-6 flex flex-col justify-between p-6 sm:p-12 lg:p-16 relative">
        {/* Top bar with back to boutique link */}
        <div className="flex items-center justify-between w-full max-w-md mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors group"
          >
            <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
            <span>{isVi ? "Trở về Tiệm nến Solenne" : "Return to Boutique"}</span>
          </Link>

          {/* Mobile Logo */}
          <Link
            href="/"
            className="lg:hidden font-serif text-xl tracking-wider font-semibold text-foreground"
          >
            SOLENNE
          </Link>
        </div>

        {/* Center Content */}
        <div className="w-full max-w-md mx-auto my-auto py-10">
          {children}
        </div>

        {/* Bottom micro footer */}
        <div className="w-full max-w-md mx-auto text-center text-xs text-muted-foreground pt-6">
          <p>
            {isVi
              ? `© ${new Date().getFullYear()} Nhà hương Solenne. Bảo lưu mọi quyền.`
              : `© ${new Date().getFullYear()} Solenne Fragrances. All rights reserved.`}
          </p>
        </div>
      </div>
    </div>
  );
}
