// ============================================
// SOLENNE — Locale Switch Scroll Restoration
// ============================================
//
// Switching language re-renders every Server Component for the new locale (see
// components/layout/i18n-provider.tsx). The route is preserved, but a
// translated page is laid out differently and the viewport is not guaranteed to
// stay put. This module parks the visitor's scroll position in `sessionStorage`
// right before the switch and returns them to it once the new locale has
// finished rendering.
//
// `sessionStorage` (not `localStorage`) is used on purpose: a parked position
// is only meaningful for the current tab and the single locale switch that
// created it.

import { clamp, isServer } from "@/lib/utils";

/** sessionStorage key holding the parked position. */
export const LOCALE_SCROLL_STORAGE_KEY = "solenne:locale-scroll-position";

/** Parked positions older than this are considered stale and are discarded. */
const MAX_AGE_MS = 60_000;

/** A restored offset may differ from the parked one by this many pixels. */
const TOLERANCE_PX = 2;

/** Upper bound on primary restoration attempts (readiness + verification). */
const MAX_ATTEMPTS = 12;

/** Backoff between primary attempts, in ms (index = attempt number). */
const RETRY_DELAYS_MS = [0, 0, 16, 32, 50, 80, 120, 160, 200, 250, 300, 350];

/** Give up on the primary phase after this long. */
const DEADLINE_MS = 3_000;

/** How long late content (images, fonts, JS sections) is watched after a hit. */
const STABILIZE_MS = 2_000;

/** Maximum corrections applied while late content settles. */
const MAX_STABILIZE_CORRECTIONS = 8;

export interface LocaleScrollPosition {
  /** Viewport offsets at the moment the visitor switched language. */
  scrollX: number;
  scrollY: number;
  /** Locale that was switched away from. */
  from: string;
  /** Locale that was switched into — the switch this position belongs to. */
  to: string;
  /** Route it was captured on: pathname + search + hash. */
  path: string;
  /** Epoch ms, used to expire positions that are never consumed. */
  savedAt: number;
}

/**
 * Set while a locale switch is in flight. Smooth-scroll/animation layers read
 * this to avoid resetting the viewport while the restoration owns it.
 */
let pendingRestore: { savedAt: number } | null = null;

/** Cancels the routine that currently owns the viewport, if any. */
let cancelActiveRestoration: (() => void) | null = null;

/** Route the parked position belongs to (pathname + search + hash). */
function currentRoutePath(): string {
  if (isServer()) return "";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Locale currently rendered by the server or the i18n provider. */
function currentDocumentLocale(): string {
  if (isServer()) return "";
  return document.documentElement.lang || "";
}

/** Current scroll limits of the document, recalculated on every read. */
function getScrollLimits(): { maxX: number; maxY: number } {
  const root = document.documentElement;
  return {
    maxX: Math.max(0, root.scrollWidth - window.innerWidth),
    maxY: Math.max(0, root.scrollHeight - window.innerHeight),
  };
}

/**
 * Park the current scroll position so it can be restored once the new locale has
 * loaded. Call this immediately before triggering the locale change.
 *
 * Returns the stored payload, or `null` when nothing could be stored (for
 * example when session storage is unavailable).
 */
export function saveLocaleScrollPosition({
  from,
  to,
}: {
  from: string;
  to: string;
}): LocaleScrollPosition | null {
  if (isServer()) return null;

  const payload: LocaleScrollPosition = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    from,
    to,
    path: currentRoutePath(),
    savedAt: Date.now(),
  };

  pendingRestore = { savedAt: payload.savedAt };

  try {
    sessionStorage.setItem(LOCALE_SCROLL_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage blocked (private mode, quota): restoration is simply skipped.
    return null;
  }

  return payload;
}

/**
 * Read the parked position and validate that it belongs to the locale switch
 * this document is completing. Anything questionable is discarded rather than
 * applied.
 */
export function readSavedLocaleScrollPosition(): LocaleScrollPosition | null {
  if (isServer()) return null;

  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(LOCALE_SCROLL_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearSavedLocaleScrollPosition();
    return null;
  }

  const saved = parsed as Partial<LocaleScrollPosition>;
  const isUsable =
    typeof saved?.scrollY === "number" &&
    typeof saved?.savedAt === "number" &&
    typeof saved?.path === "string";

  if (!isUsable) {
    clearSavedLocaleScrollPosition();
    return null;
  }

  const position = saved as LocaleScrollPosition;

  // Stale: another switch (or an unrelated visit) has happened since.
  if (Date.now() - position.savedAt > MAX_AGE_MS) {
    clearSavedLocaleScrollPosition();
    return null;
  }

  // Never restore a position that was captured on a different route.
  if (position.path !== currentRoutePath()) {
    clearSavedLocaleScrollPosition();
    return null;
  }

  // The position belongs to a switch *into* a specific locale; make sure this
  // document is rendering that locale.
  const currentLocale = currentDocumentLocale();
  if (position.to && currentLocale && position.to !== currentLocale) {
    clearSavedLocaleScrollPosition();
    return null;
  }

  return position;
}

/** Removes the stored payload without touching the in-flight switch state. */
function removeStoredPosition(): void {
  if (isServer()) return;
  try {
    sessionStorage.removeItem(LOCALE_SCROLL_STORAGE_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

/** Drop the parked position (always called once the routine is done with it). */
export function clearSavedLocaleScrollPosition(): void {
  if (isServer()) return;
  pendingRestore = null;
  removeStoredPosition();
}

/**
 * `true` while a locale switch is being restored. Smooth-scroll layers use this
 * to avoid resetting the viewport to the top midway through a restoration.
 */
export function isLocaleScrollRestorationPending(): boolean {
  if (isServer() || !pendingRestore) return false;
  return Date.now() - pendingRestore.savedAt <= MAX_AGE_MS;
}

export function restoreLocaleScrollPosition(): () => void {
  if (isServer()) return () => {};

  // A new switch must not let two routines fight over the viewport.
  if (cancelActiveRestoration) {
    const cancelPrevious = cancelActiveRestoration;
    cancelActiveRestoration = null;
    cancelPrevious();
  }

  const saved = readSavedLocaleScrollPosition();
  if (!saved) {
    // Nothing parked for this route and locale: as far as this document is
    // concerned the switch is already over, so no restoration stays pending.
    clearSavedLocaleScrollPosition();
    return () => {};
  }

  const targetX = Math.max(0, saved.scrollX);
  const targetY = Math.max(0, saved.scrollY);
  const deadlineAt = Date.now() + DEADLINE_MS;

  // Browser-native restoration would race the pixel-accurate restore below, so
  // it is suspended for the duration of the switch and handed back after.
  const previousScrollRestoration =
    "scrollRestoration" in window.history
      ? window.history.scrollRestoration
      : null;

  if (previousScrollRestoration !== null) {
    window.history.scrollRestoration = "manual";
  }

  let attempt = 0;
  let corrections = 0;
  let stabilizeStartedAt = 0;
  let settled = false;
  let scrollRestorationReleased = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryFrame: number | null = null;
  let stabilizeTimer: ReturnType<typeof setTimeout> | null = null;
  let safetyTimer: ReturnType<typeof setTimeout> | null = null;
  let observer: ResizeObserver | null = null;

  cancelActiveRestoration = cancel;
  addInteractionGuards();

  // Last resort, so the routine always terminates: if nothing else ever fires,
  // the timers below would otherwise be the only way out.
  safetyTimer = setTimeout(() => finish(), DEADLINE_MS + STABILIZE_MS + 400);

  // First attempt on the next frame, once this commit has been painted.
  retryFrame = requestAnimationFrame(() => attemptRestore());

  /**
   * Ends the routine. `consume` drops the parked position (the switch is over);
   * an aborted routine keeps it so a later run — for example React 19's
   * development StrictMode double-invoke — can still use it.
   */
  function teardown({ consume }: { consume: boolean }): void {
    if (settled) return;
    settled = true;

    if (retryTimer !== null) clearTimeout(retryTimer);
    if (stabilizeTimer !== null) clearTimeout(stabilizeTimer);
    if (safetyTimer !== null) clearTimeout(safetyTimer);
    if (retryFrame !== null) cancelAnimationFrame(retryFrame);
    retryTimer = null;
    stabilizeTimer = null;
    safetyTimer = null;
    retryFrame = null;

    observer?.disconnect();
    observer = null;
    removeInteractionGuards();

    // Normal browser back/forward behaviour is handed back.
    releaseScrollRestoration();

    if (cancelActiveRestoration === cancel) cancelActiveRestoration = null;

    if (consume) clearSavedLocaleScrollPosition();
  }

  function finish(): void {
    teardown({ consume: true });
  }

  function cancel(): void {
    teardown({ consume: false });
  }

  /** Hands native scroll restoration back as soon as we own the viewport. */
  function releaseScrollRestoration(): void {
    if (scrollRestorationReleased || previousScrollRestoration === null) return;
    scrollRestorationReleased = true;
    window.history.scrollRestoration = previousScrollRestoration;
  }

  /**
   * The parked position has been honoured: drop it immediately so it can never
   * be reused, while the in-memory target keeps guarding late content.
   */
  function consumeParkedPosition(): void {
    removeStoredPosition();
  }

  /** Instant, never smooth: the visitor should appear to stay put. */
  function applyScrollPosition(top: number, left: number): void {
    window.scrollTo({ top, left, behavior: "instant" });
  }

  function isCorrectPosition(top: number, left: number): boolean {
    return (
      Math.abs(window.scrollY - top) <= TOLERANCE_PX &&
      Math.abs(window.scrollX - left) <= TOLERANCE_PX
    );
  }

  function scheduleRetry(): void {
    if (settled) return;

    if (attempt >= MAX_ATTEMPTS) {
      finish();
      return;
    }

    const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    attempt += 1;

    if (delay <= 0) {
      retryFrame = requestAnimationFrame(attemptRestore);
    } else {
      retryTimer = setTimeout(attemptRestore, delay);
    }
  }

  function attemptRestore(): void {
    if (settled) return;
    retryFrame = null;
    retryTimer = null;

    const { maxX, maxY } = getScrollLimits();
    const top = clamp(targetY, 0, maxY);
    const left = clamp(targetX, 0, maxX);
    const outOfTime = Date.now() >= deadlineAt;

    // The document may still be shorter than the parked offset: translated
    // copy, client-only sections and lazy media all change its height, and
    // scrolling too early would be clamped. Waiting ends once the initial load
    // finishes (a shorter page is then simply how this locale renders) or the
    // deadline passes.
    const tallEnough = maxY >= targetY - TOLERANCE_PX;
    if (!tallEnough && !outOfTime && document.readyState !== "complete") {
      scheduleRetry();
      return;
    }

    // Already where the visitor left off — the usual case when the locale
    // switch keeps the viewport (e.g. the soft refresh in the i18n provider).
    if (isCorrectPosition(top, left)) {
      consumeParkedPosition();
      releaseScrollRestoration();
      startStabilizing();
      return;
    }

    applyScrollPosition(top, left);

    if (isCorrectPosition(top, left)) {
      consumeParkedPosition();
      releaseScrollRestoration();
      startStabilizing();
      return;
    }

    if (outOfTime || attempt >= MAX_ATTEMPTS) {
      // The browser refuses this offset (for instance after the page got
      // shorter): keep what it gives us instead of fighting it.
      finish();
      return;
    }

    scheduleRetry();
  }

  /**
   * Pins the restored offset for one short, bounded window while late content
   * (web fonts, images, dynamically imported sections) changes the document
   * height, then lets go.
   */
  function startStabilizing(): void {
    if (settled || stabilizeStartedAt !== 0) return;
    stabilizeStartedAt = Date.now();
    stabilizeTimer = setTimeout(() => finish(), STABILIZE_MS);

    window.addEventListener("load", handleContentSettled, { passive: true });

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(handleContentSettled);
      observer.observe(document.documentElement);
    }

    // Web-font swaps change text metrics after the first paint.
    if ("fonts" in document && document.fonts) {
      document.fonts.ready.then(handleContentSettled).catch(() => {});
    }
  }

  function handleContentSettled(): void {
    if (settled) return;

    if (
      Date.now() - stabilizeStartedAt >= STABILIZE_MS ||
      corrections >= MAX_STABILIZE_CORRECTIONS
    ) {
      finish();
      return;
    }

    const { maxX, maxY } = getScrollLimits();
    const top = clamp(targetY, 0, maxY);
    const left = clamp(targetX, 0, maxX);

    if (isCorrectPosition(top, left)) return;

    corrections += 1;
    applyScrollPosition(top, left);
  }

  function addInteractionGuards(): void {
    window.addEventListener("wheel", handleUserIntent, {
      passive: true,
      once: true,
    });
    window.addEventListener("touchstart", handleUserIntent, {
      passive: true,
      once: true,
    });
    window.addEventListener("pointerdown", handleUserIntent, {
      passive: true,
      once: true,
    });
    window.addEventListener("keydown", handleUserIntent, { once: true });
  }

  function removeInteractionGuards(): void {
    window.removeEventListener("wheel", handleUserIntent);
    window.removeEventListener("touchstart", handleUserIntent);
    window.removeEventListener("pointerdown", handleUserIntent);
    window.removeEventListener("keydown", handleUserIntent);
    window.removeEventListener("load", handleContentSettled);
  }

  /** The visitor took over: never pull the viewport back. */
  function handleUserIntent(): void {
    finish();
  }

  return cancel;
}
