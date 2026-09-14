import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
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

  if (!post) return { title: "Journal — Solenne" };

  return {
    title: `${post.title} — Solenne Journal`,
    description: post.excerpt,
  };
}

export default async function JournalPostPage({
  params,
}: JournalPostPageProps) {
  const { slug } = await params;
  const post = getJournalPost(slug);

  if (!post) notFound();

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-sm text-muted-foreground"
        >
          <Link
            href="/journal"
            className="transition-colors hover:text-foreground"
          >
            Journal
          </Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{post.title}</span>
        </nav>

        <header className="mb-12">
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {post.tag} · {post.readTime} · {post.date}
          </p>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            {post.title}
          </h1>
          <p className="text-lg text-muted-foreground">{post.excerpt}</p>
        </header>

        <div className="mb-12 aspect-[16/9] rounded-2xl bg-muted" />

        <article className="space-y-6">
          {post.body.map((paragraph) => (
            <p
              key={paragraph.slice(0, 24)}
              className="text-base leading-relaxed text-muted-foreground"
            >
              {paragraph}
            </p>
          ))}
        </article>

        <div className="mt-16 border-t border-border pt-8">
          <Link
            href="/journal"
            className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            ← Back to the Journal
          </Link>
        </div>
      </Container>
    </div>
  );
}
