/**
 * Production-optimized static responsive image mapping for Solenne product catalog.
 * Generated build-time variants reside under /images/product/optimized/
 * Bypasses broken /_next/image runtime endpoint on Cloudflare Workers.
 */

export interface OptimizedImageVariants {
  slug: string;
  avifSrcSet: string;
  webpSrcSet: string;
  fallbackSrc: string;
  widths: number[];
}

const OPTIMIZED_MAP: Record<string, { slug: string; fallbackWidth: number }> = {
  // Midnight Garden
  "solenne midnight garden candle glow.png": { slug: "solenne-midnight-garden-candle-glow", fallbackWidth: 640 },
  "solenne-midnight-garden-candle-glow": { slug: "solenne-midnight-garden-candle-glow", fallbackWidth: 640 },
  "midnight-garden": { slug: "solenne-midnight-garden-candle-glow", fallbackWidth: 640 },

  // Cedar & Sage
  "solenne cedar & sage.jpg": { slug: "solenne-cedar-and-sage", fallbackWidth: 640 },
  "solenne cedar and sage.jpg": { slug: "solenne-cedar-and-sage", fallbackWidth: 640 },
  "solenne-cedar-and-sage": { slug: "solenne-cedar-and-sage", fallbackWidth: 640 },
  "cedar-sage": { slug: "solenne-cedar-and-sage", fallbackWidth: 640 },

  // Ocean Breeze
  "solenne ocean breeze.jpg": { slug: "solenne-ocean-breeze", fallbackWidth: 640 },
  "solenne-ocean-breeze": { slug: "solenne-ocean-breeze", fallbackWidth: 640 },
  "ocean-breeze": { slug: "solenne-ocean-breeze", fallbackWidth: 640 },

  // Vanilla Ember
  "solenne vanilla ember.png": { slug: "solenne-vanilla-ember", fallbackWidth: 640 },
  "solenne-vanilla-ember": { slug: "solenne-vanilla-ember", fallbackWidth: 640 },
  "vanilla-ember": { slug: "solenne-vanilla-ember", fallbackWidth: 640 },

  // Golden Hours
  "solenne golden hours.jpg": { slug: "solenne-golden-hours", fallbackWidth: 640 },
  "solenne-golden-hours": { slug: "solenne-golden-hours", fallbackWidth: 640 },
  "golden-hour": { slug: "solenne-golden-hours", fallbackWidth: 640 },

  // Lavender Serenity
  "solenne lavender serenity.png": { slug: "solenne-lavender-serenity", fallbackWidth: 640 },
  "solenne-lavender-serenity": { slug: "solenne-lavender-serenity", fallbackWidth: 640 },
  "wild-lavender": { slug: "solenne-lavender-serenity", fallbackWidth: 640 },
};

const WIDTHS = [384, 640, 1200];

export function getOptimizedProductImage(src: string): OptimizedImageVariants | null {
  if (!src) return null;

  // Normalize string: strip query parameters, decoded URI components, lowercased filename
  const cleanPath = decodeURIComponent(src.split("?")[0]);
  const filename = cleanPath.split("/").pop()?.toLowerCase();
  if (!filename) return null;

  const entry = OPTIMIZED_MAP[filename];
  if (!entry) return null;

  const { slug, fallbackWidth } = entry;

  const avifSrcSet = WIDTHS.map((w) => `/images/product/optimized/${slug}-${w}.avif ${w}w`).join(", ");
  const webpSrcSet = WIDTHS.map((w) => `/images/product/optimized/${slug}-${w}.webp ${w}w`).join(", ");
  const fallbackSrc = `/images/product/optimized/${slug}-${fallbackWidth}.webp`;

  return {
    slug,
    avifSrcSet,
    webpSrcSet,
    fallbackSrc,
    widths: WIDTHS,
  };
}
