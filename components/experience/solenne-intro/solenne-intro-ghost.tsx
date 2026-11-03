import { ART_HEIGHT, ART_WIDTH, REVEAL } from "./solenne-intro-artwork";

/**
 * The pencil ghost behind the ink.
 *
 * The intro's detailed artwork is a ~100 kB code-split chunk, so for a beat
 * after the page paints there is nothing to draw with. Instead of showing an
 * empty ivory panel, the guard renders the mark's own centre lines at very low
 * opacity: the candle is already there, faintly, and the line-drawing then inks
 * over it. Both the pre-hydration guard and the overlay render this exact
 * group, so the hand-over is invisible.
 *
 * Intentionally a plain component (no directive, no hooks): the homepage server
 * component renders it into the first HTML paint, and the client artwork
 * renders it again inside the overlay.
 */
export function SolenneIntroGhostGroup() {
  return (
    <g className="si-ghost">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={REVEAL.rimLeft} />
        <path d={REVEAL.rimRight} />
        <path d={REVEAL.wallLeft} />
        <path d={REVEAL.wallRight} />
        <path d={REVEAL.bottom} />
        {/* The flame mask carries a construction extension up to the canvas
            top, so the flame is intentionally absent from the pencil ghost. */}
        <path d={REVEAL.wick} />
      </g>
    </g>
  );
}

/**
 * Pre-hydration companion to the overlay. `page.tsx` renders this into the
 * initial HTML; CSS only shows it while the document still carries
 * `data-solenne-intro="pending"`, which the inline guard script sets for a
 * visitor who will actually see the intro.
 */
export function SolenneIntroGhostGuard() {
  return (
    <div className="solenne-intro-guard" aria-hidden="true">
      {/* Same stage sizing as the overlay, so both ghosts land on the same pixel. */}
      <div className="solenne-intro__stage">
        <svg
          className="solenne-intro__art"
          viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          role="presentation"
          aria-hidden="true"
          focusable="false"
        >
          <SolenneIntroGhostGroup />
        </svg>
      </div>
    </div>
  );
}
