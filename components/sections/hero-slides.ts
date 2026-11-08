/**
 * Home hero posters.
 *
 * The five WebP files are generated from the source PNGs in
 * `public/images/hero/` (1672x941, quality 85, 70-104 kB each). Slide 0 is the
 * ribbon poster and is always the first frame.
 *
 * `mobileObjectPosition` only applies under 768px, where the frame is a 4:5
 * portrait crop and the poster has horizontal slack. The desktop frame is 16:9
 * like the artwork, so it is never shifted there.
 *
 * Values were chosen by looking at the actual 4:5 crop:
 *   03 — the model lies across the frame; centring her face needs 38%.
 *   04 — she reaches toward the camera on the right; 62% centres her and the
 *        candle she holds instead of cropping her forearm.
 *   05 — she stands right of centre; 62% balances her and the plinth candles.
 */
export interface HeroSlide {
  readonly src: string;
  /** Message key under the `hero` namespace, e.g. "slides.0.alt". */
  readonly altKey: string;
  /** CSS `object-position` for the 4:5 mobile frame only. */
  readonly mobileObjectPosition?: string;
}

export const HERO_SLIDES: readonly HeroSlide[] = [
  { src: "/images/hero-01.webp", altKey: "slides.0.alt" },
  { src: "/images/hero-02.webp", altKey: "slides.1.alt" },
  { src: "/images/hero-03.webp", altKey: "slides.2.alt", mobileObjectPosition: "38% 50%" },
  { src: "/images/hero-04.webp", altKey: "slides.3.alt", mobileObjectPosition: "62% 50%" },
  { src: "/images/hero-05.webp", altKey: "slides.4.alt", mobileObjectPosition: "62% 50%" },
];
