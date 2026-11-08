import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { HeroSlideshow } from "./hero-slideshow";

/**
 * Homepage hero — "gallery frame".
 *
 * A poster-sized frame (nearly the whole viewport) hangs on a cream wall, with
 * the copy in a frosted card in the bottom-left corner on desktop. Only the
 * frame is a client component; the section, the card and the CTAs are server
 * rendered, so the text is in the first HTML paint and never re-renders when
 * the poster changes.
 *
 * Mobile keeps the same order but drops the frame's fixed height and the glass:
 * the copy sits 32px below a 4:5 crop, centred, so nothing is layered over the
 * model.
 */
export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section className="bg-hero-cream px-3 pt-[92px] pb-8 md:px-5 md:pb-5">
      {/*
        The wrapper owns the frame's desktop width so the glass card, which is
        positioned against this box, can never escape the frame on wide screens.
        `min(100%, (100svh - 112px) * 16 / 9)` keeps the 16:9 frame inside the
        first viewport: on wide monitors the frame stops growing and the cream
        wall shows on both sides instead of the artwork being cropped.
      */}
      <div
        className={cn(
          "relative",
          "md:mx-auto md:w-[min(100%,calc((100svh-112px)*16/9))]"
        )}
      >
        <HeroSlideshow
          className={cn(
            "aspect-[4/5] w-full rounded-[28px]",
            "md:aspect-[16/9] md:h-auto md:rounded-[36px]"
          )}
        />


        <div
          className={cn(
            "mt-8 flex flex-col items-center text-center",
            "md:absolute md:bottom-8 md:left-8 md:z-10 md:mt-0 md:max-w-[26rem]",
            "md:items-start md:rounded-xl md:border md:border-white/50",
            "md:bg-hero-glass/50 md:p-7 md:text-left md:backdrop-blur-sm"
          )}
        >
          <p className="hero-enter hero-enter--1 text-balance text-[11px] uppercase tracking-[0.22em] text-hero-accent-ink">
            {t("eyebrow")}
          </p>

          <h1 className="hero-enter hero-enter--2 mt-3 font-serif text-[36px] leading-[1.1] text-hero-ink text-balance md:mt-2 md:text-[40px]">
            {t("title")}
          </h1>

          <div className="hero-enter hero-enter--3 mt-7 flex flex-wrap items-center justify-center gap-2.5 md:mt-5 md:justify-start">
            {/*
              The label colour sits on a <span>, not on the <a>: globals.css has
              an unlayered `a { color: inherit }` reset, and unlayered rules beat
              every Tailwind utility regardless of specificity, so a text-*
              utility on the link itself would be ignored.
            */}
            <Button
              asChild
              className="h-11 rounded-full bg-hero-ink px-5 text-[13.5px] tracking-[0.03em] hover:bg-hero-ink/90 focus-visible:ring-hero-accent"
            >
              <Link href="/products">
                <span className="text-hero-cream">{t("primaryCta")}</span>
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              className="h-11 rounded-full border-hero-ink/30 bg-transparent px-5 text-[13.5px] tracking-[0.03em] hover:bg-hero-ink/5 focus-visible:ring-hero-accent"
            >
              <Link href="/about">
                <span className="text-hero-ink">{t("secondaryCta")}</span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
