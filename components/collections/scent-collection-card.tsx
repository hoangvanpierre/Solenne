"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCENT_CATEGORIES } from "@/lib/constants";
import { ScentMotif } from "./scent-motif";
import styles from "./collections.module.css";

type ScentCategoryEntry = (typeof SCENT_CATEGORIES)[number];

/** Maximum card tilt, in degrees, at the outer edge. */
const TILT_DEGREES = 1.6;

export interface ScentCollectionCardProps {
  category: ScentCategoryEntry;
  index: number;
  isVi: boolean;
}

/**
 * One collection card: staggered scroll entrance (framer-motion) plus a
 * pointer-driven surface treatment (lift, tinted shadow, cursor sheen, tilt).
 *
 * Only this wrapper is a client component — the page around it stays a server
 * component, and no card data is fetched or mutated here.
 */
export function ScentCollectionCard({
  category,
  index,
  isVi,
}: ScentCollectionCardProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const cardRef = useRef<HTMLAnchorElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const finePointerRef = useRef(false);

  // Track pointer capability once and on change, instead of querying
  // matchMedia on every move.
  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    finePointerRef.current = query.matches;
    const onChange = (event: MediaQueryListEvent) => {
      finePointerRef.current = event.matches;
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Cancel a queued frame if the card unmounts mid-gesture.
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const handlePointerMove = (event: ReactPointerEvent<HTMLAnchorElement>) => {
    if (reduceMotion || !finePointerRef.current) return;

    pointerRef.current = { x: event.clientX, y: event.clientY };
    if (frameRef.current !== null) return;

    // One write per animation frame: --mx/--my drive the sheen, --tilt-*
    // the (very slight) 3D lean toward the cursor.
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = pointerRef.current.x - rect.left;
      const y = pointerRef.current.y - rect.top;
      const nx = Math.max(-1, Math.min(1, (x / rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (y / rect.height) * 2 - 1));

      card.style.setProperty("--mx", `${x.toFixed(1)}px`);
      card.style.setProperty("--my", `${y.toFixed(1)}px`);
      card.style.setProperty("--tilt-x", `${(-ny * TILT_DEGREES).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${(nx * TILT_DEGREES).toFixed(2)}deg`);
    });
  };

  const resetPointer = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
  };

  // Always the same props on server and client: reduced motion is neutralised
  // by `.entry` in the stylesheet (final state, `!important`) instead of
  // branching here, which would hydrate a different tree than the SSR markup.
  const entrance = {
    initial: { opacity: 0, y: 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: {
      duration: 0.55,
      delay: index * 0.09,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  };

  return (
    <motion.div className={cn(styles.entry, "h-full")} {...entrance}>
      <Link
        ref={cardRef}
        href={`/collections/${category.id}`}
        data-scent={category.id}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetPointer}
        onBlur={resetPointer}
        className={cn(
          styles.card,
          "block h-full overflow-hidden rounded-2xl border p-10 sm:p-14",
        )}
        style={
          {
            "--card-tint": category.color,
            "--motif-delay": `${index * -4.5}s`,
          } as CSSProperties
        }
      >
        <div
          className={cn(styles.tint, category.bgColor)}
          aria-hidden="true"
        />
        <div className={styles.motifWrap} aria-hidden="true">
          <ScentMotif id={category.id} />
        </div>
        <div className={styles.highlight} aria-hidden="true" />

        <div className="relative">
          <h2 className="font-serif text-xl sm:text-2xl font-normal leading-[1.25] text-foreground">
            {isVi ? category.nameVi : category.name}
          </h2>
          <p className="mt-3 max-w-md text-muted-foreground leading-relaxed">
            {isVi ? category.descriptionVi : category.description}
          </p>
          <p className="mt-6 text-sm font-medium text-foreground">
            <span className={styles.linkRow}>
              <span className={styles.linkText}>
                {isVi
                  ? `Khám phá bộ sưu tập ${category.nameVi}`
                  : `Explore the ${category.name} collection`}
                <span
                  className={styles.linkUnderline}
                  aria-hidden="true"
                />
              </span>
              <ArrowRight
                className={cn(styles.linkArrow, "h-3.5 w-3.5")}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
