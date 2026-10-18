import Link from "next/link";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { JOURNAL_POSTS } from "@/lib/journal";

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
        <div className="mb-14">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Nhật Ký Hương Sắc" : "Journal"}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base max-w-2xl leading-relaxed font-normal">
            {isVi
              ? "Những dòng tản văn từ xưởng chế tác về nghệ thuật hương thơm, câu chuyện làm nến và những nghi thức cho một tổ ấm an yên."
              : "Notes from the studio on scent, craft, and the rituals of a slower home."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {JOURNAL_POSTS.map((post) => (
            <article key={post.slug} className="group">
              <div className="mb-5 aspect-[4/3] rounded-2xl bg-muted" />
              <p className="mb-2 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-normal">
                {isVi ? post.tagVi : post.tag} · {isVi ? post.readTimeVi : post.readTime}
              </p>
              <h2 className="font-serif text-lg sm:text-xl font-normal leading-[1.3] text-foreground underline-offset-4 group-hover:underline">
                <Link href={`/journal/${post.slug}`}>
                  {isVi ? post.titleVi : post.title}
                </Link>
              </h2>
              <p className="mt-2 text-[13.5px] sm:text-[14px] text-muted-foreground leading-[1.65] font-normal line-clamp-3">
                {isVi ? post.excerptVi : post.excerpt}
              </p>
              <p className="mt-3 text-[12.5px] text-muted-foreground/80 tabular-nums font-normal">
                {isVi ? post.dateVi : post.date}
              </p>
            </article>
          ))}
        </div>
      </Container>
    </div>
  );
}
