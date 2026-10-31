import Link from "next/link";
import { getLocale } from "next-intl/server";
import { ArrowLeft, Sparkles } from "lucide-react";
import { BrandLogo } from "@/components/layout";

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
          <BrandLogo
            href="/"
            className="inline-flex items-center gap-2 font-serif text-xl sm:text-2xl tracking-[0.04em] font-normal text-cream hover:opacity-80 transition-opacity"
          >
            SOLENNE
          </BrandLogo>
          <p className="text-[10.5px] uppercase tracking-[0.2em] text-cream/60 mt-1 font-normal">
            {isVi ? "Nến thơm thủ công" : "Hand-poured scented candles"}
          </p>
        </div>

        {/* Center Quote & Craft Narrative */}
        <div className="relative z-10 max-w-md my-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-[11px] tracking-wide font-normal">
            <Sparkles className="w-3 h-3" />
            <span>{isVi ? "Không gian của bạn" : "Your account"}</span>
          </div>

          <blockquote className="font-serif text-2xl xl:text-3xl font-normal leading-relaxed text-amber-light/95">
            {isVi
              ? "“Nến đổ tay từng mẻ nhỏ, mang hơi ấm và sự tĩnh tại vào không gian của bạn.”"
              : "“Candles poured with intention, making room for warmth and quiet.”"}
          </blockquote>

          <p className="text-sm text-cream/70 leading-relaxed font-sans">
            {isVi
              ? "Đăng nhập để theo dõi đơn hàng, lưu mùi hương yêu thích và thanh toán nhanh hơn."
              : "Sign in to track your orders, save favourite scents, and check out faster."}
          </p>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-cream/50 flex items-center justify-between font-sans">
          <span>{isVi ? "Đổ tay thủ công từng mẻ nhỏ" : "Hand-poured in small batches"}</span>
          <span>{isVi ? "Sáp đậu nành & tinh dầu không phthalate" : "Soy wax & phthalate-free fragrance oils"}</span>
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
            <span>{isVi ? "Về trang chủ" : "Back to home"}</span>
          </Link>

          {/* Mobile Logo */}
          <BrandLogo
            href="/"
            className="lg:hidden text-xl tracking-[0.04em] font-normal text-foreground"
          >
            SOLENNE
          </BrandLogo>
        </div>

        {/* Center Content */}
        <div className="w-full max-w-md mx-auto my-auto py-10">
          {children}
        </div>

        {/* Bottom micro footer */}
        <div className="w-full max-w-md mx-auto text-center text-xs text-muted-foreground pt-6">
          <p>
            {isVi
              ? `© ${new Date().getFullYear()} Solenne. Bảo lưu mọi quyền.`
              : `© ${new Date().getFullYear()} Solenne. All rights reserved.`}
          </p>
        </div>
      </div>
    </div>
  );
}
