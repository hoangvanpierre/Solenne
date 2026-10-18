import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Container } from "@/components/ui/container";
import { JOURNAL_POSTS, getJournalPost } from "@/lib/journal";

interface JournalPostPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return JOURNAL_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: JournalPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getJournalPost(slug);
  const locale = await getLocale();
  const isVi = locale === "vi";

  if (!post) return { title: "Journal — Solenne" };

  return {
    title: `${isVi ? post.titleVi : post.title} — Solenne Journal`,
    description: isVi ? post.excerptVi : post.excerpt,
  };
}

export default async function JournalPostPage({
  params,
}: JournalPostPageProps) {
  const { slug } = await params;
  const post = getJournalPost(slug);
  const locale = await getLocale();
  const isVi = locale === "vi";

  if (!post) notFound();

  const title = isVi ? post.titleVi : post.title;
  const excerpt = isVi ? post.excerptVi : post.excerpt;
  const body = isVi ? post.bodyVi : post.body;
  const tag = isVi ? post.tagVi : post.tag;
  const readTime = isVi ? post.readTimeVi : post.readTime;
  const date = isVi ? post.dateVi : post.date;

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-[13px] text-muted-foreground font-normal"
        >
          <Link
            href="/journal"
            className="transition-colors hover:text-foreground"
          >
            {isVi ? "Nhật ký hương" : "Journal"}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{title}</span>
        </nav>

        <header className="mb-12">
          <p className="mb-3 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground tabular-nums font-normal">
            {tag} · {readTime} · {date}
          </p>
          <h1 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-normal mb-4 text-foreground leading-[1.22]">
            {title}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-[1.7] font-normal">
            {excerpt}
          </p>
        </header>

        <div className="mb-12 aspect-[16/9] rounded-2xl bg-muted" />

        <article className="space-y-6">
          {body.map((paragraph) => (
            <p
              key={paragraph.slice(0, 24)}
              className="text-[14px] sm:text-[15px] leading-[1.7] text-muted-foreground font-normal"
            >
              {paragraph}
            </p>
          ))}
        </article>

        <div className="mt-16 border-t border-border pt-8">
          <Link
            href="/journal"
            className="text-[13px] font-normal text-foreground underline-offset-4 hover:underline"
          >
            {isVi ? "← Trở về Nhật ký hương" : "← Back to the Journal"}
          </Link>
        </div>
      </Container>
    </div>
  );
}
