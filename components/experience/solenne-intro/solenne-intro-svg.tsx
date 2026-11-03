"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useGSAP } from "@gsap/react";
import {
  ART_COLORS,
  ART_HEIGHT,
  ART_WIDTH,
  ARTWORK,
  REVEAL,
} from "./solenne-intro-artwork";
import { buildSolenneIntroTimeline } from "./solenne-intro-timeline";
import { SolenneIntroGhostGroup } from "./solenne-intro-ghost";

export interface SolenneIntroSvgProps {
  /**
   * Flipped by the parent once the overlay is visible. The artwork may mount
   * earlier (while the overlay is still hidden), but the first stroke must land
   * on the same frame the preloader is on screen — never behind it.
   */
  started: boolean;
  /** Prefers-reduced-motion: show the finished artwork instead of drawing it. */
  reducedMotion: boolean;
  /** The fixed overlay; owns the radial-reveal custom properties. */
  overlayRef: RefObject<HTMLDivElement | null>;
  /** Called once the artwork is in the DOM (used by the chunk watchdog). */
  onMount?: () => void;
  /** Called when the timeline (or the reduced-motion hold) is finished. */
  onComplete?: () => void;
}

/**
 * The traced Solenne mark, layered so one GSAP timeline can draw it:
 *
 *   glow → wax (pink + white, rising clip) → ripples → glass (stroke mask)
 *   → flame (silhouette mask + rising clip) → wick (stroke mask) → highlight
 *
 * The visible artwork is always the exact traced silhouette; the `REVEAL`
 * centre lines only ever act as masks, so nothing about the mark is redrawn
 * by hand.
 */
export function SolenneIntroSvg({
  started,
  reducedMotion,
  overlayRef,
  onMount,
  onComplete,
}: SolenneIntroSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    onMount?.();
  }, [onMount]);

  useGSAP(
    () => {
      if (!started || !svgRef.current) return;

      const timeline = buildSolenneIntroTimeline({
        root: svgRef.current,
        overlay: overlayRef.current,
        reducedMotion,
        onComplete,
      });

      if (reducedMotion) {
        // Jump straight to the finished mark; the parent holds it briefly and
        // cross-fades the overlay out. `suppressEvents` keeps the timeline's
        // onComplete from tearing the overlay down before that hold happens.
        timeline.progress(1, true);
      } else {
        timeline.play(0);
      }
    },
    { scope: svgRef, dependencies: [started, reducedMotion] },
  );

  return (
    <svg
      ref={svgRef}
      className="solenne-intro__art"
      viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* exact traced silhouettes — the only things that are ever painted */}
        <path id="si-art-pink" d={ARTWORK.pink} fill={ART_COLORS.pink} fillRule="evenodd" />
        <path id="si-art-white" d={ARTWORK.whiteBase} fill={ART_COLORS.white} fillRule="evenodd" />
        <path id="si-art-ripples" d={ARTWORK.ripples} fill={ART_COLORS.white} fillRule="evenodd" />
        <path id="si-art-orange" d={ARTWORK.orange} fill={ART_COLORS.orange} fillRule="evenodd" />
        <path id="si-art-brown" d={ARTWORK.brown} fill={ART_COLORS.brown} fillRule="evenodd" />
        <path
          id="si-art-highlight"
          d={ARTWORK.flameHighlight}
          fill={ART_COLORS.white}
          fillRule="evenodd"
        />

        <radialGradient id="si-glow-gradient">
          <stop offset="0%" stopColor="#FFD79A" stopOpacity="0.9" />
          <stop offset="45%" stopColor="#FFB24D" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFA51F" stopOpacity="0" />
        </radialGradient>

        {/* the wax fills from the bottom of the glass up to the melt pool */}
        <clipPath id="si-clip-wax">
          <rect className="si-clip-wax" x="0" y={ART_HEIGHT} width={ART_WIDTH} height={ART_HEIGHT} />
        </clipPath>

        {/* the flame grows upward out of the wick */}
        <clipPath id="si-clip-flame">
          <rect className="si-clip-flame" x="266" y="214" width="156" height="600" />
        </clipPath>

        {/* glass: rim / walls / base drawn as centre lines, flame silhouette excluded
            by construction (the flame has its own layer on top) */}
        <mask
          id="si-mask-glass"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={ART_WIDTH}
          height={ART_HEIGHT}
        >
          <rect x="0" y="0" width={ART_WIDTH} height={ART_HEIGHT} fill="#000" />
          <g
            className="si-glass-strokes"
            fill="none"
            stroke="#fff"
            strokeWidth="13"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              className="si-draw-glass"
              d={REVEAL.rimLeft}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
            <path
              className="si-draw-glass"
              d={REVEAL.rimRight}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
            <path
              className="si-draw-glass"
              d={REVEAL.wallLeft}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
            <path
              className="si-draw-glass"
              d={REVEAL.wallRight}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
            <path
              className="si-draw-glass"
              d={REVEAL.bottom}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
          </g>
        </mask>

        {/* decorations: ribbons, stars and dots have their own mask so they can
            arrive after the flame is lit */}
        <mask
          id="si-mask-decor"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={ART_WIDTH}
          height={ART_HEIGHT}
        >
          <rect x="0" y="0" width={ART_WIDTH} height={ART_HEIGHT} fill="#000" />
          <g
            fill="none"
            stroke="#fff"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {REVEAL.ribbons.map((d, index) => (
              <path
                key={`ribbon-${index}`}
                className="si-draw-ribbon"
                d={d}
                pathLength={1}
                strokeDasharray="1"
                strokeDashoffset={1}
              />
            ))}
            <path
              className="si-draw-star"
              d={REVEAL.star5}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
            <path
              className="si-draw-star"
              d={REVEAL.sparkleRight}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
            <path
              className="si-draw-star"
              d={REVEAL.sparkleCenter}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={1}
            />
          </g>
          {REVEAL.dots.map((dot, index) => (
            <circle
              key={`dot-${index}`}
              className="si-dot"
              data-r={dot.r + 3}
              cx={dot.cx}
              cy={dot.cy}
              r={0}
              fill="#fff"
            />
          ))}
        </mask>

        {/* the flame itself, as a filled silhouette (mask, not a stroke) */}
        <mask
          id="si-mask-flame"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={ART_WIDTH}
          height={ART_HEIGHT}
        >
          <rect x="0" y="0" width={ART_WIDTH} height={ART_HEIGHT} fill="#000" />
          <path d={REVEAL.flame} fill="#fff" />
        </mask>

        {/* wick: a single tapered stroke */}
        <mask
          id="si-mask-wick"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width={ART_WIDTH}
          height={ART_HEIGHT}
        >
          <rect x="0" y="0" width={ART_WIDTH} height={ART_HEIGHT} fill="#000" />
          <path
            className="si-draw-wick"
            d={REVEAL.wick}
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={1}
            fill="none"
            stroke="#fff"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>

      {/* warm halo behind the flame; fades in with the ignition */}
      <circle
        className="si-glow"
        cx="352"
        cy="118"
        r="98"
        fill="url(#si-glow-gradient)"
        opacity="0"
      />

      {/* the pre-draw silhouette, identical to the pre-hydration guard's */}
      <SolenneIntroGhostGroup />

      {/* everything the ink draws recedes into the flame as one group */}
      <g className="si-mark">
        {/* wax */}
        <g clipPath="url(#si-clip-wax)">
          <use href="#si-art-pink" />
          <use href="#si-art-white" />
        </g>

        {/* melt-pool ripples sit on the wax surface */}
        <use className="si-ripples" href="#si-art-ripples" opacity="0" />

        {/* glass outline, ribbons, stars and dots */}
        <g mask="url(#si-mask-glass)">
          <use href="#si-art-orange" />
        </g>

        {/* flame */}
        <g clipPath="url(#si-clip-flame)">
          <g mask="url(#si-mask-flame)">
            <use href="#si-art-orange" />
          </g>
        </g>

        {/* wick sits in front of the flame, exactly as in the original artwork */}
        <g mask="url(#si-mask-wick)">
          <use href="#si-art-brown" />
        </g>

        {/* the white swoosh crosses the wick, so it is painted last */}
        <g clipPath="url(#si-clip-flame)">
          <use href="#si-art-highlight" />
        </g>

        {/* decorations arrive last, on their own mask */}
        <g mask="url(#si-mask-decor)">
          <use href="#si-art-orange" />
        </g>
      </g>
    </svg>
  );
}
