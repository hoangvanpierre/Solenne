"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { HERO_SLIDES } from "./hero-slides";

/** Slide duration; the indicator fill in globals.css is pinned to the same 6s. */
const AUTOPLAY_MS = 6000;
const SWIPE_THRESHOLD_PX = 40;
const MISSING_IMAGE_RETRY_MS = 400;

/** True once the page has fired `load` (or was already complete at hydration). */
function useWindowLoaded(): boolean {
  const subscribe = (onStoreChange: () => void) => {
    window.addEventListener("load", onStoreChange, { once: true });
    return () => window.removeEventListener("load", onStoreChange);
  };

  return useSyncExternalStore(
    subscribe,
    () => document.readyState === "complete",
    () => false
  );
}

export interface HeroSlideshowProps {
  /** Frame sizing/radius, owned by the section that lays it out. */
  className?: string;
}

/**
 * The hero's image frame: five stacked posters, a 6s crossfade, and the
 * progress indicators. Everything else on the hero is a server component.
 *
 * Loading order matters for LCP: only poster 1 is mounted eagerly with
 * `priority`; the others mount after the window `load` event with
 * `fetchPriority="low"`, and the crossfade refuses to advance until the next
 * poster has actually decoded.
 */
export function HeroSlideshow({ className }: HeroSlideshowProps) {
  const t = useTranslations("hero");
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const count = HERO_SLIDES.length;

  const [active, setActive] = useState(0);
  const ready = useWindowLoaded();
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);

  const paused = hoverPaused || focusPaused || tabHidden;

  const loadedRef = useRef<Set<number>>(new Set([0]));
  /** Time left in the current cycle; survives a pause. */
  const remainingRef = useRef(AUTOPLAY_MS);
  /** Set when a cycle ends by advancing, so cleanup does not bank the delta. */
  const completedRef = useRef(false);
  const touchStartX = useRef<number | null>(null);

  // Mount posters 2-5 only after the page has finished loading, so they never
  // compete with the LCP image (or the fonts) for bandwidth. `useWindowLoaded`
  // subscribes to that event; there is no effect to keep in sync.

  // Pause while the tab is in the background.
  useEffect(() => {
    const sync = () => setTabHidden(document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const next = ((index % count) + count) % count;
      // A manual change starts a fresh cycle; tell the running timer's cleanup
      // not to bank the interrupted remainder over it.
      remainingRef.current = AUTOPLAY_MS;
      completedRef.current = true;
      setActive(next);
    },
    [count]
  );

  useEffect(() => {
    if (reduceMotion || paused) return;

    completedRef.current = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = performance.now();
    const delay = remainingRef.current;

    const advance = () => {
      if (cancelled) return;

      const next = (active + 1) % count;
      if (!loadedRef.current.has(next)) {
        // Never crossfade into a poster that is still downloading.
        timer = setTimeout(advance, MISSING_IMAGE_RETRY_MS);
        return;
      }

      completedRef.current = true;
      remainingRef.current = AUTOPLAY_MS;
      setActive(next);
    };

    timer = setTimeout(advance, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);

      if (completedRef.current) {
        completedRef.current = false;
        return;
      }

      // Pausing (or leaving reduced motion) keeps the rest of the cycle, so the
      // timer resumes where the indicator fill was paused.
      remainingRef.current = Math.max(0, delay - (performance.now() - startedAt));
    };
  }, [active, count, paused, reduceMotion]);

  const markLoaded = useCallback((index: number) => {
    loadedRef.current.add(index);
  }, []);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;

    const delta = (event.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;

    goTo(active + (delta < 0 ? 1 : -1));
  };

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={t("carouselLabel")}
      className={cn(
        "relative overflow-hidden bg-hero-cream",
        className
      )}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocus={() => setFocusPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocusPaused(false);
        }
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Separate from the slides so the scroll parallax and the per-slide zoom
          never write to the same transform. */}
      <div className="hero-parallax absolute inset-0">
        {HERO_SLIDES.map((slide, index) => {
          if (index > 0 && !ready) return null;

          const isActive = index === active;

          return (
            <Image
              key={slide.src}
              src={slide.src}
              alt={t(slide.altKey)}
              fill
              sizes="100vw"
              unoptimized
              preload={index === 0}
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "low"}
              onLoad={() => markLoaded(index)}
              aria-hidden={!isActive}
              style={
                slide.mobileObjectPosition
                  ? ({
                      "--hero-slide-position": slide.mobileObjectPosition,
                    } as React.CSSProperties)
                  : undefined
              }
              className={cn(
                "hero-slide object-cover",
                isActive && "hero-slide--active"
              )}
            />
          );
        })}
      </div>

      {/* Indicators: bottom-centre on mobile, bottom-right inside the frame on
          desktop. The hit area is 24px tall; the visible bar is 24x2. */}
      <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5 md:inset-x-auto md:right-7 md:bottom-7 md:justify-end">
        {HERO_SLIDES.map((slide, index) => {
          const isActive = index === active;

          return (
            <button
              key={slide.src}
              type="button"
              onClick={() => goTo(index)}
              aria-label={t("indicator", { index: index + 1, total: count })}
              aria-current={isActive ? "true" : undefined}
              className="flex h-6 w-6 cursor-pointer items-center justify-center"
            >
              <span className="relative block h-0.5 w-6 overflow-hidden rounded-full bg-hero-ink/35">
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="hero-progress absolute inset-0 rounded-full bg-hero-ink"
                    style={{
                      animationPlayState: paused ? "paused" : "running",
                    }}
                  />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
