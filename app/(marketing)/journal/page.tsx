import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui/container";
import { JOURNAL_POSTS } from "@/lib/journal";

export const metadata: Metadata = {
  title: "Journal — Solenne",
  description:
    "Notes from the Solenne studio: scent profiles, candle care rituals, and the small moments of peace we craft for.",
};

export default function JournalPage() {
  return (
    <div className="py-24 lg:py-32">
      <Container>
        <div className="mb-16">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Journal
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl">
            Notes from the studio on scent, craft, and the rituals of a slower
            home.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {JOURNAL_POSTS.map((post) => (
            <article key={post.slug} className="group">
              <div className="mb-5 aspect-[4/3] rounded-2xl bg-muted" />
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {post.tag} · {post.readTime}
              </p>
              <h2 className="font-serif text-2xl font-semibold text-foreground underline-offset-4 group-hover:underline">
                <Link href={`/journal/${post.slug}`}>{post.title}</Link>
              </h2>
              <p className="mt-3 text-muted-foreground">{post.excerpt}</p>
              <p className="mt-4 text-sm text-muted-foreground">{post.date}</p>
            </article>
          ))}
        </div>
      </Container>
    </div>
  );
}
