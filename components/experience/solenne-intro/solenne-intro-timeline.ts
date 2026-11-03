import gsap from "gsap";
import {
  INTRO_TIMINGS,
  introOrigin,
  introRevealRadius,
} from "./solenne-intro-config";

export interface SolenneIntroTimelineOptions {
  /** The <svg> root — every selector below is scoped to it. */
  root: SVGSVGElement;
  /** The fixed overlay that owns the radial-reveal custom properties. */
  overlay: HTMLElement | null;
  reducedMotion?: boolean;
  onComplete?: () => void;
}

/**
 * One coordinated timeline for the whole intro.
 *
 * Masks (not the artwork) are what animate, so the mark is always the exact
 * traced silhouette: the stroke masks draw the glass/decorations in, the two
 * clip rects fill the wax and grow the flame, and the final step opens a hole
 * in the overlay centred on the flame so the homepage is revealed radially.
 */
export function buildSolenneIntroTimeline({
  root,
  overlay,
  reducedMotion = false,
  onComplete,
}: SolenneIntroTimelineOptions): gsap.core.Timeline {
  const select = gsap.utils.selector(root);

  const ghost = select(".si-ghost");
  const mark = select(".si-mark");
  const glassStrokes = select(".si-draw-glass");
  const ribbonStrokes = select(".si-draw-ribbon");
  const starStrokes = select(".si-draw-star");
  const dotReveals = select(".si-dot");
  const wickStroke = select(".si-draw-wick");
  const waxClip = select(".si-clip-wax");
  const flameClip = select(".si-clip-flame");
  const ripples = select(".si-ripples");
  const glow = select(".si-glow");

  const timeline = gsap.timeline({
    paused: true,
    defaults: { ease: "power2.inOut" },
    onComplete,
  });
  const registry = window as unknown as {
    __siTimelines?: Array<{ time: () => number; progress: () => number; parent: () => unknown; paused: () => boolean; targets: unknown }>;
    __siTimeline?: unknown;
    __siTimelineCount?: number;
  };
  registry.__siTimelines = registry.__siTimelines ?? [];
  registry.__siTimelines.push(
    timeline as unknown as { time: () => number; progress: () => number; parent: () => unknown; paused: () => boolean; targets: unknown },
  );
  registry.__siTimeline = timeline;
  registry.__siTimelineCount = (registry.__siTimelineCount ?? 0) + 1;

  /* ---------------------------------------------------------------- ghost
     The pencil silhouette is already on screen (it is what the pre-hydration
     guard paints). The ink simply takes over as the glass strokes land, so the
     first drawn frame is never an empty ivory panel. */
  timeline.to(
    ghost,
    {
      opacity: 0,
      duration: INTRO_TIMINGS.ghost.end - INTRO_TIMINGS.ghost.start,
      ease: "power1.out",
    },
    INTRO_TIMINGS.ghost.start,
  );

  /* ---------------------------------------------------------------- glass
     The rim spreads outward from the flame, the walls fall from the rim and
     the base closes the jar last. 0.0 -> 0.8 */
  timeline.to(
    glassStrokes,
    {
      strokeDashoffset: 0,
      duration: 0.5,
      stagger: { each: 0.055, from: "start" },
      ease: "power2.inOut",
    },
    INTRO_TIMINGS.glass.start,
  );

  /* Thickening the finished mask closes the 1–2px seams where the artwork is
     clipped by the canvas edge. A mask can only reveal pixels that exist, so
     this never exposes anything that is not already part of the mark.

     It waits until the flame is lit (1.9) on purpose: a thick rim stroke also
     reveals the sliver of flame that sits behind it, so keeping the glass thin
     while the candle is still unlit keeps the ignition a surprise. By 1.9 the
     flame covers that sliver anyway. */
  timeline.to(
    glassStrokes,
    { strokeWidth: 26, duration: 0.12, ease: "none" },
    INTRO_TIMINGS.flame.end,
  );

  /* ------------------------------------------------------------------ wax
     The candle fills from the bottom of the glass up to the melt pool.
     0.6 -> 1.3 */
  timeline.to(
    waxClip,
    {
      attr: { y: 232 },
      duration: INTRO_TIMINGS.wax.end - INTRO_TIMINGS.wax.start,
      ease: "power2.out",
    },
    INTRO_TIMINGS.wax.start,
  );

  timeline.to(ripples, { opacity: 1, duration: 0.28, ease: "power2.out" }, 1.02);

  /* ----------------------------------------------------------------- wick
     1.2 -> 1.5 */
  timeline.to(
    wickStroke,
    { strokeDashoffset: 0, duration: 0.3, ease: "power1.inOut" },
    INTRO_TIMINGS.wick.start,
  );

  /* ---------------------------------------------------------------- flame
     The light rises out of the wick; the halo blooms with it. 1.4 -> 1.9 */
  timeline.to(
    flameClip,
    {
      attr: { y: -12 },
      duration: INTRO_TIMINGS.flame.end - INTRO_TIMINGS.flame.start,
      ease: "power2.out",
    },
    INTRO_TIMINGS.flame.start,
  );

  timeline.to(
    glow,
    { opacity: 0.55, duration: 0.42, ease: "power2.out" },
    INTRO_TIMINGS.flame.start + 0.04,
  );

  /* ---------------------------------------------------------- decorations
     Ribbons, stars and the two dots settle once the flame is lit. 1.8 -> 2.1 */
  timeline.to(
    ribbonStrokes,
    {
      strokeDashoffset: 0,
      duration: 0.22,
      stagger: { each: 0.03, from: "start" },
      ease: "power2.out",
    },
    INTRO_TIMINGS.decorations.start,
  );

  timeline.to(
    starStrokes,
    {
      strokeDashoffset: 0,
      duration: 0.18,
      stagger: { each: 0.02, from: "start" },
      ease: "power2.out",
    },
    INTRO_TIMINGS.decorations.start + 0.04,
  );

  timeline.to(
    dotReveals,
    {
      attr: { r: (_index: number, element: Element) => Number(element.getAttribute("data-r") ?? 0) },
      duration: 0.14,
      stagger: { each: 0.02, from: "start" },
      ease: "back.out(2)",
    },
    INTRO_TIMINGS.decorations.start + 0.14,
  );

  timeline.to(
    [...ribbonStrokes, ...starStrokes],
    { strokeWidth: 26, duration: 0.08, ease: "none" },
    INTRO_TIMINGS.decorations.start + 0.22,
  );

  /* --------------------------------------------------------------- reveal
     The flame's halo swells, the candle recedes into it, and only then does the
     hole open — so the Hero never appears behind the artwork. 1.92 -> 2.62 */
  if (!reducedMotion && overlay) {
    const rect = root.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth || rect.width,
      height: window.innerHeight || rect.height,
    };
    const origin = introOrigin(rect, viewport);
    const radius = introRevealRadius(origin, viewport);
    const revealDuration = INTRO_TIMINGS.reveal.end - INTRO_TIMINGS.reveal.start;
    const recedeDuration = INTRO_TIMINGS.recede.end - INTRO_TIMINGS.recede.start;

    overlay.style.setProperty("--si-reveal-x", `${origin.x}px`);
    overlay.style.setProperty("--si-reveal-y", `${origin.y}px`);
    overlay.style.setProperty("--si-reveal-r", "0px");

    /* The flame is the light source: its halo swells before the hole starts
       opening, so the reveal reads as the flame's own light rather than a
       separate wipe. The radius overshoots the opening so the light reads as
       the thing pushing the ivory back. */
    timeline.to(
      glow,
      {
        attr: { r: 250 },
        opacity: 0.9,
        duration: INTRO_TIMINGS.glowBloom.end - INTRO_TIMINGS.glowBloom.start,
        ease: "power1.out",
      },
      INTRO_TIMINGS.glowBloom.start,
    );

    /* The mark fades into its own light. Only opacity is animated — no
       transform touches `.si-mark`, so the glass, wax, wick and decorations
       stay exactly where they were drawn while the radial hole takes over.
       The fade is complete before the circle can reach the Hero heading. */
    timeline.to(
      mark,
      {
        opacity: 0,
        duration: recedeDuration,
        ease: "power2.inOut",
      },
      INTRO_TIMINGS.recede.start,
    );

    const reveal = { r: 0 };
    timeline.to(
      reveal,
      {
        r: radius,
        duration: revealDuration,
        ease: "power2.inOut",
        onUpdate: () => {
          overlay.style.setProperty("--si-reveal-r", `${reveal.r.toFixed(1)}px`);
        },
      },
      INTRO_TIMINGS.reveal.start,
    );

    timeline.to(
      glow,
      {
        opacity: 0,
        duration: INTRO_TIMINGS.glowFade.end - INTRO_TIMINGS.glowFade.start,
        ease: "power1.in",
      },
      INTRO_TIMINGS.glowFade.start,
    );
  }

  return timeline;
}
