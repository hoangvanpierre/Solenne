"use client";

import React, { useRef, useMemo } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger);

export interface TextFillAnimationProps {
  /** The text to display and progressively fill on scroll. */
  text: string;
  /** Additional CSS classes on the outer `<section>` wrapper. */
  className?: string;
  /**
   * CSS color for the muted (unrevealed) state.
   * @default "var(--muted-foreground)"
   */
  mutedColor?: string;
  /**
   * CSS color for the active (fully revealed) state.
   * @default "var(--foreground)"
   */
  activeColor?: string;
  /**
   * CSS color for the warm accent edge that sweeps across each character.
   * @default "var(--primary)"
   */
  accentColor?: string;
  /**
   * Responsive text size classes (Tailwind).
   * @default "text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
   */
  textSize?: string;
  /**
   * Font weight class (Tailwind).
   * @default "font-semibold"
   */
  fontWeight?: string;
  /**
   * Max-width constraint class for the text block.
   * @default "max-w-4xl"
   */
  maxWidth?: string;
  /**
   * Total vertical scroll distance the section occupies (CSS value).
   * Controls how slowly the fill progresses — larger = slower.
   * @default "220vh"
   */
  scrollDistance?: string;
  /**
   * GSAP scrub value. `true` or a number (seconds of smoothing).
   * @default 0.8
   */
  scrub?: boolean | number;
}

/**
 * A luxury scroll-driven text fill animation where the fill effect physically
 * moves across each character glyph from left to right as the user scrolls.
 *
 * Each character is styled with a multi-stop gradient (active → amber accent → muted)
 * clipped to the text glyph (`background-clip: text`).
 *
 * Generic Typography & Descender Preservation:
 * In calligraphic and script fonts (like Birthstone), characters with descenders
 * ("g", "p", "q", "y", "j") extend up to ~95% below the font baseline, and tall
 * ascenders / diacritics extend significantly above the baseline. Birthstone's OS/2
 * font metrics report a descent of ~953/1000 units — nearly a full em.
 *
 * When using `background-clip: text`, the browser clips the background painting area
 * to the element's border-box. If the character's border-box has insufficient vertical
 * padding, glyph portions that extend beyond the box receive NO background paint and
 * render transparent (appear clipped).
 *
 * Solution:
 * We expand the character's bounding box generously in all directions:
 * - `padding: 0.6em 0.15em 1.0em 0.15em` extends the background painting box to fully
 *   encompass Birthstone's extreme descenders below (~0.95em) and tall ascenders/accents
 *   above, plus diacritics for Vietnamese and other accented characters.
 * - `margin: -0.6em -0.15em -1.0em -0.15em` counterbalances the padding exactly,
 *   ensuring zero distortion to the line height, vertical alignment, or horizontal
 *   kerning.
 * - Applies uniformly to EVERY character without special-casing any letter.
 */
export function TextFillAnimation({
  text,
  className,
  mutedColor = "var(--brand-story-muted, #B0A8A0)",
  activeColor = "var(--brand-story-active, #14100E)",
  accentColor = "var(--brand-story-accent, #C4956A)",
  textSize = "text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl",
  fontWeight = "font-semibold",
  maxWidth = "max-w-4xl",
  scrollDistance = "220vh",
  scrub = 0.8,
}: TextFillAnimationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const charsRef = useRef<HTMLSpanElement[]>([]);

  // Split text into words and preserve spaces.
  // Pre-index each non-space character deterministically in useMemo to prevent
  // mutable counter drift across React render passes.
  const { words, totalChars } = useMemo(() => {
    let globalIdx = 0;
    const parsedWords = text.split(/(\s+)/).map((segment, wi) => {
      const isSpace = /^\s+$/.test(segment);
      const chars = Array.from(segment).map((ch, ci) => ({
        ch,
        ci,
        idx: isSpace ? -1 : globalIdx++,
      }));
      return {
        segment,
        isSpace,
        chars,
        wi,
      };
    });
    return { words: parsedWords, totalChars: globalIdx };
  }, [text]);

  // Gradient stops — tight transition for a sharp, premium fill edge:
  // [0% - 40%]: Pure activeColor (fully revealed, solid)
  // [40% - 47%]: Warm accent glow at the wavefront
  // [47% - 55%]: Transition to mutedColor
  // [55% - 100%]: Pure mutedColor (unrevealed)
  const gradientString = useMemo(() => {
    return `linear-gradient(90deg, ${activeColor} 0%, ${activeColor} 40%, ${accentColor} 47%, ${mutedColor} 55%, ${mutedColor} 100%)`;
  }, [activeColor, accentColor, mutedColor]);

  // Initial style for each animatable character:
  // - paddingTop: 0.65em / paddingBottom: 1.05em expands the background-clip border-box
  //   vertically so calligraphic descenders (g, p, y, q, j) and ascenders (d, h, b, E, accents)
  //   are never sliced off at the line box boundary, even with bolder font-weights.
  // - paddingLeft / paddingRight: 0.2em prevents clipping of cursive horizontal swashes.
  // - Negative margins exactly negate the padding in layout, preserving natural line spacing
  //   and letter kerning.
  // - 300% width background positioned at 100% shows pure mutedColor initially.
  const charStyle: React.CSSProperties = useMemo(() => {
    return {
      display: "inline-block",
      fontWeight: "inherit",
      paddingTop: "0.65em",
      paddingBottom: "1.05em",
      paddingLeft: "0.2em",
      paddingRight: "0.2em",
      marginTop: "-0.65em",
      marginBottom: "-1.05em",
      marginLeft: "-0.2em",
      marginRight: "-0.2em",
      backgroundImage: gradientString,
      backgroundSize: "300% 100%",
      backgroundPosition: "100% 0%",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      WebkitFontSmoothing: "antialiased",
      MozOsxFontSmoothing: "grayscale",
      textRendering: "optimizeLegibility",
    };
  }, [gradientString]);

  useGSAP(
    () => {
      const container = containerRef.current;
      const chars = charsRef.current.slice(0, totalChars).filter(Boolean);
      if (!container || chars.length === 0) return;

      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

      if (prefersReducedMotion) {
        chars.forEach((el) => {
          if (el) {
            el.style.backgroundImage = "none";
            el.style.color = activeColor;
            (el.style as CSSStyleDeclaration).webkitTextFillColor = "initial";
          }
        });
        return;
      }

      // Ensure all characters begin at 100% 0% (pure muted)
      gsap.set(chars, {
        backgroundPosition: "100% 0%",
      });

      // Animate backgroundPosition from 100% 0% to 0% 0% on each character.
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: container,
          start: "top top",
          end: "bottom bottom",
          scrub: scrub,
          invalidateOnRefresh: true,
        },
      });

      tl.to(chars, {
        backgroundPosition: "0% 0%",
        duration: 1,
        stagger: 0.35,
        ease: "none",
      });

      // Recalculate ScrollTrigger once web fonts have fully settled
      if (typeof document !== "undefined" && document.fonts?.ready) {
        document.fonts.ready.then(() => {
          ScrollTrigger.refresh();
        });
      }
    },
    {
      scope: containerRef,
      dependencies: [text, gradientString, activeColor, scrub, totalChars],
    }
  );

  return (
    <section
      ref={containerRef}
      className={cn("relative bg-background", className)}
      style={{ minHeight: scrollDistance }}
    >
      <div className="sticky top-0 flex h-screen w-full items-center justify-center px-6 sm:px-8">
        <p
          className={cn(
            "text-center font-serif leading-snug antialiased",
            fontWeight,
            textSize,
            maxWidth
          )}
          style={{
            textRendering: "optimizeLegibility",
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          }}
          aria-label={text}
        >
          <span aria-hidden="true">
            {words.map((word) => {
              if (word.isSpace) {
                return (
                  <span key={`ws-${word.wi}`} className="inline-block">
                    &nbsp;
                  </span>
                );
              }

              return (
                <span
                  key={`w-${word.wi}`}
                  className="inline-block whitespace-nowrap"
                >
                  {word.chars.map(({ ch, idx, ci }) => (
                    <span
                      key={`c-${idx}-${ci}`}
                      ref={(el) => {
                        if (el) charsRef.current[idx] = el;
                      }}
                      style={charStyle}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
              );
            })}
          </span>
        </p>
      </div>
    </section>
  );
}
