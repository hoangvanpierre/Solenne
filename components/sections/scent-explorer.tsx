"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Leaf, Wind, Flame, Sparkles, ArrowRight, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { TextReveal } from "@/components/animations/text-reveal";
import { SCENT_CATEGORIES } from "@/lib/constants";
import { useAppLocale } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";
import type { ScentCategory } from "@/types";

// Dynamic import of 3D Canvas with ssr: false for WebGL safety
const ScentCanvas = dynamic(
  () => import("./scent-canvas").then((mod) => mod.ScentCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[400px] w-full items-center justify-center rounded-3xl bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Igniting flame...
          </span>
        </div>
      </div>
    ),
  }
);

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  flower: <Leaf className="h-5 w-5" />,
  tree: <Sparkles className="h-5 w-5" />,
  wind: <Wind className="h-5 w-5" />,
  flame: <Flame className="h-5 w-5" />,
};

const CATEGORY_NOTES: Record<
  ScentCategory,
  {
    top: string;
    heart: string;
    base: string;
    topVi: string;
    heartVi: string;
    baseVi: string;
  }
> = {
  floral: {
    top: "Bergamot, White Jasmine",
    heart: "Damask Rose, Peony Petals",
    base: "Velvet Musk, Light Amber",
    topVi: "Cam Bergamot, Hoa Nhài Trắng",
    heartVi: "Hoa Hồng Damask, Cánh Mẫu Đơn",
    baseVi: "Xạ Hương Nhung, Hổ Phách Nhẹ",
  },
  woody: {
    top: "Smoked Cypress, Cardamom",
    heart: "Atlas Cedarwood, Guaiac",
    base: "Sandalwood, Earthy Patchouli",
    topVi: "Bách Xông Khói, Bạch Đậu Khấu",
    heartVi: "Tuyết Tùng Atlas, Gỗ Guaiac",
    baseVi: "Đàn Hương, Hoắc Hương Đất Mẹ",
  },
  fresh: {
    top: "Italian Neroli, Sweet Mandarin",
    heart: "Sea Salt, Crushed Mint Leaves",
    base: "White Sage, Driftwood",
    topVi: "Neroli Ý, Quýt Ngọt",
    heartVi: "Muối Biển, Lá Bạc Hà Vò Nát",
    baseVi: "Xô Thơm Trắng, Gỗ Trôi Biển",
  },
  warm: {
    top: "Spiced Cinnamon, Nutmeg",
    heart: "Bourbon Vanilla, Caramel",
    base: "Golden Amber, Tonka Bean",
    topVi: "Quế Cay Nồng, Nhục Đậu Khấu",
    heartVi: "Vani Bourbon, Caramel",
    baseVi: "Hổ Phách Vàng, Đậu Tonka",
  },
};

export function ScentExplorer() {
  const t = useTranslations("scentExplorer");
  const [activeId, setActiveId] = useState<ScentCategory>("floral");
  const [mounted, setMounted] = useState(false);
  const locale = useAppLocale();

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentCategory =
    SCENT_CATEGORIES.find((c) => c.id === activeId) ?? SCENT_CATEGORIES[0];
  const notes = CATEGORY_NOTES[activeId];

  return (
    <section className="relative overflow-hidden py-24 lg:py-32 bg-background">
      <Container>
        {/* Section Header */}
        <div className="mb-14 text-center">
          <ScrollReveal>
            <p className="text-xs tracking-[0.25em] uppercase text-muted-foreground mb-3">
              {t("tagline")}
            </p>
          </ScrollReveal>
          <TextReveal
            text={t("title")}
            as="h2"
            className="font-serif text-4xl md:text-5xl lg:text-6xl font-semibold text-foreground"
            splitBy="word"
          />
          <ScrollReveal delay={0.1}>
            <p className="mt-4 text-muted-foreground text-sm md:text-base max-w-lg mx-auto">
              {t("description")}
            </p>
          </ScrollReveal>
        </div>

        {/* 3D Showcase & Category Explorer */}
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left: 3D Interactive Canvas */}
          <div className="lg:col-span-7">
            <ScrollReveal>
              <div className="relative rounded-3xl border border-border/70 bg-gradient-to-b from-muted/30 to-muted/10 p-4 shadow-sm backdrop-blur-sm">
                {/* 3D Canvas */}
                {mounted ? (
                  <ScentCanvas category={activeId} />
                ) : (
                  <div className="h-[400px] w-full rounded-2xl bg-muted/20" />
                )}

                {/* Interactive hint badge */}
                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl bg-background/80 px-4 py-2.5 backdrop-blur-md border border-border/50 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <RotateCw className="h-3.5 w-3.5 animate-spin text-primary" style={{ animationDuration: "8s" }} />
                    {t("dragHint")}
                  </span>
                  <span className="font-serif italic text-foreground hidden sm:inline">
                    Solenne Maison
                  </span>
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* Right: Scent Family Selector & Scent Profile Details */}
          <div className="flex flex-col justify-center space-y-8 lg:col-span-5">
            {/* Category Selector Tabs */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
              {SCENT_CATEGORIES.map((cat) => {
                const isActive = cat.id === activeId;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveId(cat.id as ScentCategory)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-2xl p-3.5 text-left transition-all duration-300 border",
                      isActive
                        ? "border-primary/40 bg-primary/5 shadow-sm"
                        : "border-border/60 hover:border-border hover:bg-muted/40"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {CATEGORY_ICONS[cat.icon]}
                    </div>
                    <div>
                      <p className="font-serif text-sm font-medium text-foreground">
                        {locale === "vi" ? cat.nameVi : cat.name}
                      </p>
                      <span className="text-[11px] text-muted-foreground">
                        {t("family")}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Scent Details Card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeId}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25 }}
                className="space-y-6 rounded-3xl border border-border/80 bg-background/50 p-6 md:p-8 backdrop-blur-sm"
              >
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      {t("harmony")}
                    </span>
                  </div>
                  <h3 className="font-serif text-3xl font-medium text-foreground">
                    {locale === "vi"
                      ? currentCategory.nameVi
                      : currentCategory.name}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {locale === "vi"
                      ? currentCategory.descriptionVi
                      : currentCategory.description}
                  </p>
                </div>

                {/* Scent Notes Breakdown */}
                <div className="space-y-2.5 rounded-2xl bg-muted/40 p-4 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium text-foreground">{t("topNotes")}</span>
                    <span className="text-muted-foreground">
                      {locale === "vi" ? notes.topVi : notes.top}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-foreground">{t("heartNotes")}</span>
                    <span className="text-muted-foreground">
                      {locale === "vi" ? notes.heartVi : notes.heart}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-foreground">{t("baseNotes")}</span>
                    <span className="text-muted-foreground">
                      {locale === "vi" ? notes.baseVi : notes.base}
                    </span>
                  </div>
                </div>

                {/* CTA Link */}
                <div>
                  <Button asChild size="lg" className="w-full gap-2">
                    <Link href={`/collections/${currentCategory.id}`}>
                      <span>
                        {locale === "vi"
                          ? `Khám phá dòng nến ${currentCategory.nameVi}`
                          : `Explore ${currentCategory.name} Candles`}
                      </span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </Container>
    </section>
  );
}
