"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getLenis } from "@/components/animations/smooth-scroll";
import { useLockedBody } from "@/hooks/use-locked-body";
import { cn } from "@/lib/utils";
import {
  INTRO_DOCUMENT_ATTRIBUTE,
  INTRO_SESSION_KEY,
  INTRO_WATCHDOG,
  getIntroStorage,
  hasPlayedIntro,
  isReplayRequested,
  markIntroPlayed,
  resolveIntroMode,
  type IntroMode,
} from "./solenne-intro-config";
import "./solenne-intro.css";

/**
 * The artwork (and the ~100 kB of traced path data) lives in its own chunk, so
 * visitors who will not see the intro never download it.
 */
const SolenneIntroSvg = dynamic(
  () => import("./solenne-intro-svg").then((mod) => mod.SolenneIntroSvg),
  { ssr: false },
);

type Phase = "idle" | "arming" | "playing" | "done";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface SolenneIntroProps {
  /** Extra class names for the overlay (optional). */
  className?: string;
}

/**
 * "The First Flame" — a one-time, homepage-only preloader that draws the
 * Solenne mark and then opens the page radially from the flame.
 *
 * Rules:
 * - plays at most once per browser session (sessionStorage);
 * - never blocks assistive tech (decorative, aria-hidden, no focus trap);
 * - always ends — a chunk, asset or animation failure removes the overlay;
 * - respects prefers-reduced-motion with a short still + fade.
 */
export function SolenneIntro({ className }: SolenneIntroProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<IntroMode>("skip");
  const [leaving, setLeaving] = useState(false);
  /* False until the code-split artwork has mounted. The overlay stays
     `visibility: hidden` behind the pre-hydration ivory guard until then, so
     its first visible frame already contains the mark being drawn instead of an
     empty ivory panel. */
  const [ready, setReady] = useState(false);

  const overlayRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);
  const mountedRef = useRef(false);

  const overlayActive = phase === "arming" || phase === "playing";

  useLockedBody(overlayActive);

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    document.documentElement.removeAttribute(INTRO_DOCUMENT_ATTRIBUTE);
    setPhase("done");
  }, []);

  const handleMount = useCallback(() => {
    mountedRef.current = true;
    /* The artwork is in the DOM; the next commit makes the overlay visible. */
    setReady(true);
  }, []);

  /* Drop the pre-hydration guard only once the overlay has painted its own
     ghost. Both surfaces carry the same silhouette, so the swap is invisible —
     while removing the attribute any earlier would flash the hero through. */
  useIsomorphicLayoutEffect(() => {
    if (!ready) return;
    document.documentElement.removeAttribute(INTRO_DOCUMENT_ATTRIBUTE);
  }, [ready]);

  /* Decide before the first paint: a returning visitor never sees a frame of
     the overlay. A visitor who will see it keeps the pre-hydration guard (ivory
     plus the pencil ghost) until the overlay has mounted and painted its own
     ghost — then the two swap in the same frame. */
  useIsomorphicLayoutEffect(() => {
    const storage = getIntroStorage();
    const isDev = process.env.NODE_ENV !== "production";
    let reducedMotion = false;
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reducedMotion = false;
    }

    const resolved = resolveIntroMode({
      played: hasPlayedIntro(storage),
      reducedMotion,
      replay: isReplayRequested(window.location.search, isDev),
    });

    if (resolved === "skip") {
      document.documentElement.removeAttribute(INTRO_DOCUMENT_ATTRIBUTE);
      return;
    }

    markIntroPlayed(storage);
    setMode(resolved);
    setPhase("arming");
  }, []);

  /* Arm: no hero-asset wait. The overlay is opaque ivory, so waiting for the
     hero's fonts and images only produced a blank pause before the first
     stroke. The draw starts once the overlay is visible (`started={ready}`);
     this frame simply advances the phase for the reduced-motion hold. */
  useEffect(() => {
    if (phase !== "arming") return;

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!cancelled) setPhase("playing");
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [phase]);

  /* Safety nets: if the artwork chunk never arrives, or the timeline throws,
     the overlay is removed rather than trapping the visitor on ivory. */
  useEffect(() => {
    if (!overlayActive) return;

    const chunk = setTimeout(() => {
      if (!mountedRef.current) finish();
    }, INTRO_WATCHDOG.chunk);
    const total = setTimeout(finish, INTRO_WATCHDOG.total);

    return () => {
      clearTimeout(chunk);
      clearTimeout(total);
    };
  }, [overlayActive, finish]);

  /* Reduced motion: hold the finished mark briefly, then cross-fade out. */
  useEffect(() => {
    if (phase !== "playing" || mode !== "reduced") return;

    const hold = setTimeout(() => setLeaving(true), INTRO_WATCHDOG.reducedHold);
    const fade = setTimeout(
      finish,
      INTRO_WATCHDOG.reducedHold + INTRO_WATCHDOG.reducedFade + 60,
    );

    return () => {
      clearTimeout(hold);
      clearTimeout(fade);
    };
  }, [phase, mode, finish]);

  /* Pause Lenis while the overlay owns the screen; the body lock handles native
     scrolling. Never creates a second instance and never touches the ticker. */
  useEffect(() => {
    if (!overlayActive) return;

    const lenis = getLenis();
    try {
      lenis?.stop();
    } catch {
      /* Lenis was not ready yet — the body lock still applies */
    }

    return () => {
      try {
        lenis?.start();
      } catch {
        /* instance already destroyed */
      }
    };
  }, [overlayActive]);

  /* Dev-only replay: `?intro=1` on load, or `__solenneIntroReplay()` in a console. */
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const scoped = window as typeof window & {
      __solenneIntroReplay?: () => void;
    };
    scoped.__solenneIntroReplay = () => {
      try {
        window.sessionStorage.removeItem(INTRO_SESSION_KEY);
      } catch {
        /* storage blocked — reloading still replays nothing, but never throws */
      }
      window.location.reload();
    };

    return () => {
      delete scoped.__solenneIntroReplay;
    };
  }, []);

  if (phase === "idle" || phase === "done" || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={cn(
        "solenne-intro",
        !ready && "solenne-intro--pending",
        leaving && "solenne-intro--leaving",
        className,
      )}
      aria-hidden="true"
      data-solenne-intro-overlay=""
    >
      <div className="solenne-intro__stage">
        <SolenneIntroSvg
          started={ready}
          reducedMotion={mode === "reduced"}
          overlayRef={overlayRef}
          onMount={handleMount}
          onComplete={finish}
        />
      </div>
    </div>,
    document.body,
  );
}
