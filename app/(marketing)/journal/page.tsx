import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ScrollReveal } from "@/components/animations/scroll-reveal";
import { TextReveal } from "@/components/animations/text-reveal";
import { JournalCard } from "@/components/journal";
import { Container } from "@/components/ui/container";
import { JOURNAL_POSTS } from "@/lib/journal";
import { cn } from "@/lib/utils";
import styles from "./journal-motion.module.css";

export const metadata: Metadata = {
  title: "Journal — Solenne",
  description:
    "Notes from the Solenne studio: scent profiles, candle care rituals, and the small moments of peace we craft for.",
};

export default async function JournalPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className={cn("mb-14", styles.intro)}>
          <TextReveal
            text={isVi ? "Nhật Ký Hương Sắc" : "Journal"}
            as="h1"
            className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]"
          />
          <ScrollReveal
            className={styles.introBody}
            delay={0.28}
            duration={0.55}
          >
            <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed font-normal">
              {isVi
                ? "Những dòng tản văn từ xưởng chế tác về nghệ thuật hương thơm, câu chuyện làm nến và những nghi thức cho một tổ ấm an yên."
                : "Notes from the studio on scent, craft, and the rituals of a slower home."}
            </p>
          </ScrollReveal>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {JOURNAL_POSTS.map((post, index) => (
            <JournalCard
              key={post.slug}
              post={post}
              index={index}
              isVi={isVi}
            />
          ))}
        </div>
      </Container>
    </div>
  );
}
