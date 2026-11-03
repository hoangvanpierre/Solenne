import test from "node:test";
import assert from "node:assert/strict";
import {
  ART_VIEWBOX,
  FLAME_CENTRE,
  INTRO_DOCUMENT_ATTRIBUTE,
  INTRO_DOCUMENT_PENDING,
  INTRO_GUARD_SCRIPT,
  INTRO_REPLAY_PARAM,
  INTRO_SESSION_KEY,
  INTRO_TIMINGS,
  INTRO_WATCHDOG,
  getIntroStorage,
  hasPlayedIntro,
  introOrigin,
  introRevealRadius,
  isReplayRequested,
  markIntroPlayed,
  resolveIntroMode,
  type IntroStorage,
} from "../../components/experience/solenne-intro/solenne-intro-config.ts";
import {
  ART_HEIGHT,
  ART_WIDTH,
} from "../../components/experience/solenne-intro/solenne-intro-artwork.ts";

// ---------------------------------------------------------------------------
// Once-per-session rules
// ---------------------------------------------------------------------------

function memoryStorage(initial: Record<string, string> = {}): IntroStorage & {
  entries: Map<string, string>;
} {
  const entries = new Map(Object.entries(initial));
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

test("a fresh session has not played the intro", () => {
  assert.equal(hasPlayedIntro(memoryStorage()), false);
});

test("markIntroPlayed writes the flag that hasPlayedIntro reads", () => {
  const storage = memoryStorage();
  markIntroPlayed(storage);
  assert.equal(storage.entries.get(INTRO_SESSION_KEY), "1");
  assert.equal(hasPlayedIntro(storage), true);
});

test("blocked storage never throws and never claims the intro played", () => {
  const throwing: IntroStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
  };

  assert.doesNotThrow(() => markIntroPlayed(throwing));
  assert.equal(hasPlayedIntro(throwing), false);
  assert.equal(hasPlayedIntro(null), false);
  assert.doesNotThrow(() => markIntroPlayed(null));
});

test("getIntroStorage is null outside the browser", () => {
  // The unit runner has no `window`, which is exactly the server case.
  assert.equal(typeof window, "undefined");
  assert.equal(getIntroStorage(), null);
});

test("any stored value other than the flag counts as not played", () => {
  assert.equal(hasPlayedIntro(memoryStorage({ [INTRO_SESSION_KEY]: "0" })), false);
  assert.equal(hasPlayedIntro(memoryStorage({ [INTRO_SESSION_KEY]: "true" })), false);
  assert.equal(hasPlayedIntro(memoryStorage({ [INTRO_SESSION_KEY]: "1" })), true);
});

// ---------------------------------------------------------------------------
// Replay escape hatch (development only)
// ---------------------------------------------------------------------------

test("?intro=1 requests a replay only when replay is enabled", () => {
  assert.equal(isReplayRequested("?intro=1", true), true);
  assert.equal(isReplayRequested("?intro=1", false), false);
});

test("only the exact value 1 replays", () => {
  for (const search of ["", "?intro", "?intro=0", "?intro=true", "?intros=1"]) {
    assert.equal(isReplayRequested(search, true), false, search);
  }
});

test("the replay parameter is found alongside other parameters", () => {
  assert.equal(isReplayRequested("?utm_source=x&intro=1&debug=2", true), true);
});

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

test("returning visitors skip the intro", () => {
  assert.equal(
    resolveIntroMode({ played: true, reducedMotion: false, replay: false }),
    "skip",
  );
});

test("first visits get the full draw", () => {
  assert.equal(
    resolveIntroMode({ played: false, reducedMotion: false, replay: false }),
    "full",
  );
});

test("reduced motion gets the still, never the full draw", () => {
  assert.equal(
    resolveIntroMode({ played: false, reducedMotion: true, replay: false }),
    "reduced",
  );
});

test("an explicit replay overrides the played flag but not reduced motion", () => {
  assert.equal(
    resolveIntroMode({ played: true, reducedMotion: false, replay: true }),
    "full",
  );
  assert.equal(
    resolveIntroMode({ played: true, reducedMotion: true, replay: true }),
    "reduced",
  );
});

// ---------------------------------------------------------------------------
// Reveal geometry
// ---------------------------------------------------------------------------

const VIEWPORT = { width: 1440, height: 900 };

test("the reveal origin follows the flame inside the artwork box", () => {
  const rect = { left: 300, top: 50, width: ART_VIEWBOX.width / 2, height: ART_VIEWBOX.height / 2 };
  const origin = introOrigin(rect, VIEWPORT);

  assert.equal(origin.x, 300 + (FLAME_CENTRE.x / ART_VIEWBOX.width) * rect.width);
  assert.equal(origin.y, 50 + (FLAME_CENTRE.y / ART_VIEWBOX.height) * rect.height);
});

test("a missing or collapsed artwork box falls back to a usable origin", () => {
  for (const rect of [null, { left: 0, top: 0, width: 0, height: 0 }]) {
    const origin = introOrigin(rect, VIEWPORT);
    assert.equal(origin.x, VIEWPORT.width / 2);
    assert.ok(origin.y > 0 && origin.y < VIEWPORT.height);
  }
});

test("the reveal radius always covers the whole viewport", () => {
  const origin = introOrigin({ left: 200, top: 100, width: 600, height: 700 }, VIEWPORT);
  const radius = introRevealRadius(origin, VIEWPORT);

  const corners = [
    [0, 0],
    [VIEWPORT.width, 0],
    [0, VIEWPORT.height],
    [VIEWPORT.width, VIEWPORT.height],
  ];

  for (const [x, y] of corners) {
    assert.ok(Math.hypot(x - origin.x, y - origin.y) <= radius, `corner ${x},${y}`);
  }
});

test("the reveal radius is rounded up and padded, so the edge is never clipped", () => {
  const origin = { x: 0, y: 0 };
  const radius = introRevealRadius(origin, { width: 100, height: 100 });
  assert.equal(radius, Math.ceil(Math.hypot(100, 100)) + 32);
});

// ---------------------------------------------------------------------------
// Timings and budgets
// ---------------------------------------------------------------------------

test("the timeline starts at zero and finishes in about 2.6s", () => {
  assert.equal(INTRO_TIMINGS.glass.start, 0);
  assert.equal(INTRO_TIMINGS.ghost.start, 0);

  const stages = Object.values(INTRO_TIMINGS);
  const end = Math.max(...stages.map((stage) => stage.end));

  assert.ok(end >= 2.5 && end <= 2.7, `timeline end was ${end}`);
  assert.equal(INTRO_TIMINGS.reveal.end, end);
});

test("stages run in order and overlap their neighbours", () => {
  const order = [
    "glass",
    "wax",
    "wick",
    "flame",
    "decorations",
  ] as const;

  for (let index = 0; index < order.length; index += 1) {
    const stage = INTRO_TIMINGS[order[index]];
    assert.ok(stage.end > stage.start, `${order[index]} has a positive duration`);

    if (index > 0) {
      const previous = INTRO_TIMINGS[order[index - 1]];
      assert.ok(
        stage.start > previous.start,
        `${order[index]} starts after ${order[index - 1]}`,
      );
      assert.ok(
        stage.start < previous.end,
        `${order[index]} overlaps ${order[index - 1]}`,
      );
    }
  }

  // The reveal is the hand-off, not a stage of the drawing: it starts as the
  // decorations settle, so the page opens the moment the mark is whole.
  assert.ok(INTRO_TIMINGS.reveal.start >= INTRO_TIMINGS.decorations.start);
  assert.ok(
    INTRO_TIMINGS.reveal.start - INTRO_TIMINGS.decorations.end <= 0.05,
    "the reveal follows the settling decorations within 50ms",
  );
});

test("the pencil ghost hands over while the glass is still drawing", () => {
  assert.ok(INTRO_TIMINGS.ghost.end > 0);
  assert.ok(
    INTRO_TIMINGS.ghost.end <= INTRO_TIMINGS.glass.end,
    "the ghost has faded before the glass outline is complete",
  );
  assert.ok(
    INTRO_TIMINGS.ghost.end >= INTRO_TIMINGS.glass.start,
    "the ghost is on screen for the first ink stroke",
  );
});

test("the light leads the opening and the candle recedes before the copy", () => {
  // The halo must swell before the hole starts moving: the reveal is the
  // flame's light, not a separate wipe.
  assert.ok(INTRO_TIMINGS.glowBloom.start < INTRO_TIMINGS.reveal.start);
  assert.ok(INTRO_TIMINGS.glowBloom.end <= INTRO_TIMINGS.reveal.start + 0.08);

  // The artwork must be fully gone early in the reveal, so the Hero heading
  // can never be seen through it. This is the collision budget the sequence
  // spends: the mark has to finish receding right as the hole starts moving.
  assert.ok(INTRO_TIMINGS.recede.end > INTRO_TIMINGS.recede.start);
  assert.ok(
    INTRO_TIMINGS.recede.end - INTRO_TIMINGS.reveal.start <= 0.15,
    "the mark has receded within 150ms of the opening",
  );

  // The halo outlives the mark, then dissolves before the overlay is removed.
  assert.ok(INTRO_TIMINGS.glowFade.start > INTRO_TIMINGS.recede.end);
  assert.ok(INTRO_TIMINGS.glowFade.end <= INTRO_TIMINGS.reveal.end);
});

test("no stage runs past the end of the timeline", () => {
  const end = INTRO_TIMINGS.reveal.end;
  for (const [name, stage] of Object.entries(INTRO_TIMINGS)) {
    assert.ok(stage.end <= end, `${name} ends inside the timeline`);
  }
});

test("every watchdog is a positive budget and the overlay always dies", () => {
  for (const [name, value] of Object.entries(INTRO_WATCHDOG)) {
    assert.ok(Number.isFinite(value) && value > 0, `${name} is a positive budget`);
  }

  assert.ok(INTRO_WATCHDOG.assets < INTRO_WATCHDOG.total);
  assert.ok(INTRO_WATCHDOG.chunk < INTRO_WATCHDOG.total);
  assert.ok(
    INTRO_WATCHDOG.reducedHold + INTRO_WATCHDOG.reducedFade < INTRO_WATCHDOG.total,
  );
});

// ---------------------------------------------------------------------------
// Contract with the generated artwork
// ---------------------------------------------------------------------------

test("the duplicated viewBox matches the generated artwork", () => {
  assert.equal(ART_VIEWBOX.width, ART_WIDTH);
  assert.equal(ART_VIEWBOX.height, ART_HEIGHT);
});

test("the flame centre sits inside the artwork", () => {
  assert.ok(FLAME_CENTRE.x > 0 && FLAME_CENTRE.x < ART_WIDTH);
  assert.ok(FLAME_CENTRE.y > 0 && FLAME_CENTRE.y < ART_HEIGHT);
});

test("the document attribute and session key are stable strings", () => {
  // These are the contract with the inline guard script in the root layout; a
  // rename without updating both would silently bring back the flash.
  assert.equal(INTRO_SESSION_KEY, "solenne:intro:played");
  assert.equal(INTRO_DOCUMENT_ATTRIBUTE, "data-solenne-intro");
  assert.equal(INTRO_DOCUMENT_PENDING, "pending");
  assert.equal(INTRO_REPLAY_PARAM, "intro");
});

test("the pre-paint guard is homepage-only and honours the session flag", () => {
  // The guard lives in the root layout's <head>, so it runs on every document;
  // it must do nothing on any route other than the homepage.
  assert.match(INTRO_GUARD_SCRIPT, /location\.pathname\s*===\s*"\/"/);
  assert.ok(INTRO_GUARD_SCRIPT.includes(INTRO_SESSION_KEY));
  assert.ok(INTRO_GUARD_SCRIPT.includes(INTRO_DOCUMENT_ATTRIBUTE));
  assert.ok(INTRO_GUARD_SCRIPT.includes(INTRO_DOCUMENT_PENDING));
  // A blocked sessionStorage must not throw out of the guard.
  assert.match(INTRO_GUARD_SCRIPT, /^try\{.*\}catch\(e\)\{\}$/);
});
