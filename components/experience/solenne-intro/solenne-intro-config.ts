/**
 * Contract for the homepage "First Flame" intro.
 *
 * Everything here is intentionally free of React, GSAP and DOM globals so the
 * once-per-session rules, the stage timings and the reveal geometry can be
 * exercised directly by `tests/unit/solenne-intro.test.ts`.
 */

/** sessionStorage flag: the intro has already played in this browser session. */
export const INTRO_SESSION_KEY = "solenne:intro:played";

/** Dev-only `?intro=1` escape hatch that replays the intro. */
export const INTRO_REPLAY_PARAM = "intro";

/**
 * Attribute written to <html> by the inline guard in `app/layout.tsx`
 * *before* hydration, so the ivory backdrop exists on the very first paint.
 */
export const INTRO_DOCUMENT_ATTRIBUTE = "data-solenne-intro";
export const INTRO_DOCUMENT_PENDING = "pending";

/**
 * The pre-paint guard, executed from the document <head>.
 *
 * It must never live in a page component: React renders page payloads on the
 * client during navigation, and a script tag created that way is never
 * executed (and logs a console error). The root layout is rendered once per
 * document, so this runs during HTML parsing — before the body is painted —
 * exactly where a "no flash of the hero" guard belongs. It only marks the
 * homepage, and only when this browser session has not seen the intro.
 */
export const INTRO_GUARD_SCRIPT = `try{if(location.pathname==="/"&&!sessionStorage.getItem(${JSON.stringify(
  INTRO_SESSION_KEY,
)})){document.documentElement.setAttribute(${JSON.stringify(
  INTRO_DOCUMENT_ATTRIBUTE,
)},${JSON.stringify(INTRO_DOCUMENT_PENDING)})}}catch(e){}`;

/**
 * Mirrors `ART_WIDTH` / `ART_HEIGHT` in the generated `solenne-intro-artwork.ts`.
 * Duplicated here so this module (imported by the server page for the inline
 * guard) never pulls the ~100 kB artwork payload into the RSC bundle.
 * `tests/unit/solenne-intro.test.ts` asserts the two stay in sync.
 */
export const ART_VIEWBOX = { width: 696, height: 800 } as const;

/** Centre of the flame in artwork units — the origin of the radial reveal. */
export const FLAME_CENTRE = { x: 352, y: 118 } as const;

/** One coordinated 2.6s timeline; each stage overlaps the next slightly. */
export const INTRO_TIMINGS = {
  /** The pencil ghost hands over to the ink as the first strokes land. */
  ghost: { start: 0, end: 0.55 },
  glass: { start: 0, end: 0.8 },
  wax: { start: 0.6, end: 1.3 },
  wick: { start: 1.2, end: 1.5 },
  flame: { start: 1.4, end: 1.9 },
  decorations: { start: 1.8, end: 2.1 },
  /** The flame halo swells as the decorations settle, then the hole opens. */
  glowBloom: { start: 1.92, end: 2.18 },
  /**
   * The candle fades into its own light as the hole begins to open, and is
   * completely gone before the opening can reach the Hero copy.
   */
  recede: { start: 1.96, end: 2.22 },
  reveal: { start: 2.14, end: 2.62 },
  /** The halo dissolves as the page finishes opening. */
  glowFade: { start: 2.34, end: 2.54 },
} as const;

/** Fallback budgets. Every one of them ends with the overlay removed. */
export const INTRO_WATCHDOG = {
  /** Longest we wait for the hero's own assets before starting anyway. */
  assets: 900,
  /** Longest we wait for the (code-split) artwork chunk before giving up. */
  chunk: 4000,
  /** Absolute ceiling: the overlay never outlives this. */
  total: 7000,
  /** Reduced-motion: how long the still artwork is held before fading. */
  reducedHold: 480,
  /** Reduced-motion: the cross-fade out of the overlay. */
  reducedFade: 260,
} as const;

export type IntroMode = "full" | "reduced" | "skip";

export interface IntroStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** sessionStorage, or null when the browser blocks it (Safari private mode, etc.). */
export function getIntroStorage(): IntroStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function hasPlayedIntro(storage: IntroStorage | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(INTRO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/** Best-effort write: a blocked storage must never stop the intro from playing. */
export function markIntroPlayed(storage: IntroStorage | null): void {
  if (!storage) return;
  try {
    storage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    /* private mode / quota — the intro simply plays again next time */
  }
}

/** `?intro=1` replays the intro, but only when the caller allows it (dev). */
export function isReplayRequested(search: string, enabled: boolean): boolean {
  if (!enabled) return false;
  try {
    return new URLSearchParams(search).get(INTRO_REPLAY_PARAM) === "1";
  } catch {
    return false;
  }
}

/**
 * - already played in this session -> skip
 * - prefers-reduced-motion -> show the finished artwork, then a short fade
 * - otherwise -> the full draw
 */
export function resolveIntroMode({
  played,
  reducedMotion,
  replay,
}: {
  played: boolean;
  reducedMotion: boolean;
  replay: boolean;
}): IntroMode {
  if (!replay && played) return "skip";
  return reducedMotion ? "reduced" : "full";
}

export interface IntroOrigin {
  x: number;
  y: number;
}

export interface IntroRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the flame sits on screen, in viewport pixels, for the radial reveal.
 * Falls back to the middle of the viewport when the artwork is not laid out yet
 * (zero-sized rect) so the reveal always has a usable origin.
 */
export function introOrigin(
  rect: IntroRect | null,
  viewport: { width: number; height: number },
): IntroOrigin {
  const usable = rect && rect.width > 0 && rect.height > 0 ? rect : null;
  if (!usable) {
    return { x: viewport.width / 2, y: viewport.height * 0.42 };
  }
  return {
    x: usable.left + (FLAME_CENTRE.x / ART_VIEWBOX.width) * usable.width,
    y: usable.top + (FLAME_CENTRE.y / ART_VIEWBOX.height) * usable.height,
  };
}

/** Radius that covers the whole viewport from `origin`. */
export function introRevealRadius(
  origin: IntroOrigin,
  viewport: { width: number; height: number },
): number {
  const dx = Math.max(origin.x, viewport.width - origin.x);
  const dy = Math.max(origin.y, viewport.height - origin.y);
  return Math.ceil(Math.hypot(dx, dy)) + 32;
}
