"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useIntersection } from "@/hooks/use-intersection";
import { cn } from "@/lib/utils";
import type { JournalPost } from "@/lib/journal";
import styles from "./journal-card.module.css";

/** Left-to-right delay between the two columns. Resets every row. */
const STAGGER_MS = 90;
const COLUMNS = 2;

export interface JournalCardProps {
  post: JournalPost;
  index: number;
  isVi: boolean;
}

/**
 * One Journal listing card.
 *
 * The page stays a server component; only this card is interactive. It owns
 * three progressive enhancements:
 *
 *  1. A one-shot IntersectionObserver entrance. The row-aware delay comes from
 *     `index % 2`, so it resets on every row instead of growing down the page.
 *  2. An image `load` listener that swaps the shimmer for a short blur-up.
 *  3. A rAF-throttled parallax offset, enabled only for fine-pointer desktops
 *     and disabled for reduced motion.
 *
 * The server markup is the complete card, and the component renders it hidden
 * for motion-capable browsers. If scripting or CSS is unavailable, the
 * stylesheet falls back to the final state (see the module CSS).
 */
export function JournalCard({ post, index, isVi }: JournalCardProps) {
  const title = isVi ? post.titleVi : post.title;
  const excerpt = isVi ? post.excerptVi : post.excerpt;
  const tag = isVi ? post.tagVi : post.tag;
  const readTime = isVi ? post.readTimeVi : post.readTime;
  const date = isVi ? post.dateVi : post.date;

  const [revealRef, inView] = useIntersection<HTMLElement>({
    triggerOnce: true,
    rootMargin: "0px 0px -8% 0px",
    threshold: 0.12,
  });

  const frameRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // A cached image can finish before hydration, so `onLoad` never fires.
  // Read the DOM once on mount and skip the skeleton/blur-up in that case.
  useEffect(() => {
    if (!post.imageCard) return;
    const image = frameRef.current?.querySelector("img");
    if (image?.complete && image.naturalWidth > 0) setImageLoaded(true);
  }, [post.imageCard]);

  // Very small counter-scroll parallax: the photo layer is 108% of the frame
  // and moves by at most 4% in either direction, so its edges always stay
  // covered. Only transform is written, and only one rAF runs per scroll.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !post.imageCard) return;

    const finePointer = window.matchMedia(
      "(min-width: 768px) and (hover: hover) and (pointer: fine)",
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    let frameId = 0;
    let active = false;

    const update = () => {
      frameId = 0;
      const rect = frame.getBoundingClientRect();
      if (rect.height === 0) return;

      const viewportHeight = window.innerHeight;
      const progress = Math.min(
        1,
        Math.max(0, (viewportHeight - rect.top) / (viewportHeight + rect.height)),
      );
      // -4% -> +4% of the frame height as the card crosses the viewport.
      const offset = ((progress - 0.5) * 0.08 * rect.height).toFixed(2);
      frame.style.setProperty("--journal-parallax-y", `${offset}px`);
    };

    const requestUpdate = () => {
      if (frameId !== 0) return;
      frameId = requestAnimationFrame(update);
    };

    const setActive = () => {
      const shouldRun = finePointer.matches && !reducedMotion.matches;
      if (shouldRun === active) return;
      active = shouldRun;

      if (active) {
        window.addEventListener("scroll", requestUpdate, { passive: true });
        window.addEventListener("resize", requestUpdate);
        requestUpdate();
      } else {
        window.removeEventListener("scroll", requestUpdate);
        window.removeEventListener("resize", requestUpdate);
        if (frameId !== 0) cancelAnimationFrame(frameId);
        frameId = 0;
        frame.style.removeProperty("--journal-parallax-y");
      }
    };

    setActive();
    finePointer.addEventListener("change", setActive);
    reducedMotion.addEventListener("change", setActive);

    return () => {
      finePointer.removeEventListener("change", setActive);
      reducedMotion.removeEventListener("change", setActive);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frame.style.removeProperty("--journal-parallax-y");
    };
  }, [post.imageCard]);

  const delayStyle = {
    "--journal-stagger": `${(index % COLUMNS) * STAGGER_MS}ms`,
  } as CSSProperties;

  return (
    <article
      ref={revealRef}
      className={styles.card}
      data-revealed={inView ? "true" : "false"}
      style={delayStyle}
    >
      <Link
        href={`/journal/${post.slug}`}
        className={styles.link}
        aria-label={title}
      >
        <div
          ref={frameRef}
          className={cn(
            styles.frame,
            "relative mb-5 aspect-[4/3] overflow-hidden rounded-2xl bg-muted",
          )}
        >
          <div className={styles.parallax} aria-hidden="true">
            <div className={styles.mediaReveal}>
              {post.imageCard ? (
                <div
                  className={styles.photo}
                  data-loaded={imageLoaded ? "true" : "false"}
                >
                  <Image
                    src={post.imageCard}
                    alt=""
                    fill
                    priority={index < COLUMNS}
                    sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1279px) calc(50vw - 40px), 592px"
                    className={cn("object-cover", styles.photoImage)}
                    unoptimized
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageLoaded(true)}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {post.imageCard ? (
            <Skeleton
              className={cn(styles.skeleton, "absolute inset-0 rounded-none")}
              data-hidden={imageLoaded ? "true" : "false"}
              aria-hidden="true"
            />
          ) : null}

          <div className={styles.shade} aria-hidden="true" />
        </div>

        <p
          className={cn(
            styles.meta,
            "mb-2 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground font-normal",
          )}
        >
          {tag} · {readTime}
        </p>
        <h2
          className={cn(
            styles.title,
            "font-serif text-lg sm:text-xl font-normal leading-[1.3] text-foreground",
          )}
        >
          {title}
        </h2>
        <p
          className={cn(
            styles.excerpt,
            "mt-2 text-[13.5px] sm:text-[14px] text-muted-foreground leading-[1.65] font-normal line-clamp-3",
          )}
        >
          {excerpt}
        </p>
        <p
          className={cn(
            styles.date,
            "mt-3 text-[12.5px] text-muted-foreground/80 tabular-nums font-normal",
          )}
        >
          {date}
        </p>
      </Link>
    </article>
  );
}
