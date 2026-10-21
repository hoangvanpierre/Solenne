"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

// Count-up for a single numeric KPI.
//
// RENDERING CONTRACT
//   - The server render (and therefore the hydration render) is the FINAL
//     value. With JavaScript disabled, or when the visitor prefers reduced
//     motion, the card simply shows the true figure — never a standing zero.
//   - The count-up is started from a layout effect, i.e. synchronously during
//     the hydration commit and before the first painted frame, so the number
//     does not visibly snap from the final value back to zero.
//   - `value` is the numeric KPI. Labels and pre-formatted strings are never
//     parsed, and only integer counts are animated.
//
// ACCESSIBILITY
//   - Intermediate frames are aria-hidden. Screen readers are given the final,
//     locale-formatted value from one visually hidden node, so nothing is
//     announced per frame and the accessible value never depends on motion.
//
// BEHAVIOUR
//   - Runs once per mount, the first time the value is on screen. Cards below
//     the fold wait for an intersection, so the effect is never spent
//     off-screen.
//   - A genuinely new `value` (a refresh) is shown immediately instead of
//     replaying the entrance, which would misrepresent a live update as a
//     page arrival.

const DURATION_MS = 520;

// `useLayoutEffect` in the browser, `useEffect` during the server render: the
// standard isomorphic guard, so no SSR warning is emitted.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function createFormatter(locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    maximumFractionDigits: 0,
  });
}

export interface AdminKpiValueProps {
  /** The numeric KPI — an integer count, never a formatted string. */
  value: number;
  locale?: string;
}

export function AdminKpiValue({ value, locale = "en" }: AdminKpiValueProps) {
  // First render on both server and client: the true value (no mismatch).
  const [display, setDisplay] = useState(value);

  const hostRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<number | null>(null);
  const hasStartedRef = useRef(false);
  const latestValueRef = useRef(value);
  const lastSeenValueRef = useRef(value);

  const formatter = useMemo(() => createFormatter(locale), [locale]);
  const format = (amount: number) => formatter.format(Math.round(amount));

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useIsomorphicLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const target = Math.round(value);
    const motionAllowed =
      typeof window.matchMedia === "function" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Nothing to count up to, or motion is suppressed: keep the final value.
    if (!motionAllowed || target <= 0) {
      hasStartedRef.current = true;
      return;
    }

    let observer: IntersectionObserver | null = null;

    const start = () => {
      if (hasStartedRef.current) return;
      hasStartedRef.current = true;

      const goal = Math.round(latestValueRef.current);
      const startedAt = performance.now();
      setDisplay(0);

      const step = (now: number) => {
        // The rAF timestamp can precede the `performance.now()` captured when
        // the loop was scheduled, so clamp instead of trusting it: a negative
        // progress would briefly render a negative count.
        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / DURATION_MS)
        );

        if (progress >= 1) {
          frameRef.current = null;
          setDisplay(goal);
          return;
        }

        // Ease-out cubic: quick to read, settles gently on the real figure.
        setDisplay(goal * (1 - Math.pow(1 - progress, 3)));
        frameRef.current = requestAnimationFrame(step);
      };

      frameRef.current = requestAnimationFrame(step);
    };

    // Cards already in the viewport count up immediately (still pre-paint).
    const rect = host.getBoundingClientRect();
    const isOnScreen = rect.top < window.innerHeight && rect.bottom > 0;

    if (isOnScreen) {
      start();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer?.disconnect();
          start();
        },
        { threshold: 0.5 }
      );
      observer.observe(host);
    }

    return () => {
      observer?.disconnect();

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }

      // Re-arm: React Strict Mode unmounts and remounts this effect in
      // development, and a cancelled frame must never leave the card parked at
      // zero. Restarting the count-up is idempotent and always ends on the
      // real value.
      hasStartedRef.current = false;
    };
    // Deliberately one-shot: later `value` changes are handled by the effect
    // below rather than by restarting this.
  }, []);

  useEffect(() => {
    if (lastSeenValueRef.current === value) return;
    lastSeenValueRef.current = value;

    // A genuine value change is rendered as-is: no restart, no animation.
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    setDisplay(value);
  }, [value]);

  return (
    <>
      <span ref={hostRef} aria-hidden="true">
        {format(display)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
