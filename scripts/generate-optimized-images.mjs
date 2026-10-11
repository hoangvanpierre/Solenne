import { statSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

function resolveSharp() {
  const req = createRequire(import.meta.url);
  try {
    return req("sharp");
  } catch {}

  try {
    const nextReq = createRequire(req.resolve("next"));
    return nextReq("sharp");
  } catch {}

  throw new Error("Unable to resolve Sharp via package import or Next.js dependency tree.");
}

const sharp = resolveSharp();

const SRC_DIR = resolve("./public/images/product");
const OUT_DIR = resolve("./public/images/product/optimized");

export const IMAGE_MAP = [
  {
    originalFile: "Solenne Midnight Garden Candle Glow.png",
    slug: "solenne-midnight-garden-candle-glow",
  },
  {
    originalFile: "Solenne Cedar & Sage.jpg",
    slug: "solenne-cedar-and-sage",
  },
  {
    originalFile: "Solenne Ocean Breeze.jpg",
    slug: "solenne-ocean-breeze",
  },
  {
    originalFile: "Solenne Vanilla Ember.png",
    slug: "solenne-vanilla-ember",
  },
  {
    originalFile: "Solenne Golden Hours.jpg",
    slug: "solenne-golden-hours",
  },
  {
    originalFile: "Solenne Lavender Serenity.png",
    slug: "solenne-lavender-serenity",
  },
];

export const WIDTHS = [384, 640, 1200];

async function generate() {
  console.log("=== Generating Optimized Product Image Variants ===");
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  const results = [];
  let totalOrigBytes = 0;
  let totalOptBytes = 0;

  for (const item of IMAGE_MAP) {
    const inputPath = join(SRC_DIR, item.originalFile);
    if (!existsSync(inputPath)) {
      console.warn(`File not found: ${inputPath}`);
      continue;
    }

    const origStat = statSync(inputPath);
    totalOrigBytes += origStat.size;

    console.log(`\nProcessing: ${item.originalFile} (${(origStat.size / 1024).toFixed(1)} KB)`);

    const imageResults = {
      name: item.originalFile,
      slug: item.slug,
      origBytes: origStat.size,
      variants: {},
    };

    for (const w of WIDTHS) {
      // 1. AVIF
      const avifFileName = `${item.slug}-${w}.avif`;
      const avifPath = join(OUT_DIR, avifFileName);
      await sharp(inputPath)
        .resize({ width: w, withoutEnlargement: true })
        .avif({ quality: 80, effort: 6 })
        .toFile(avifPath);

      const avifStat = statSync(avifPath);
      totalOptBytes += avifStat.size;

      // 2. WebP
      const webpFileName = `${item.slug}-${w}.webp`;
      const webpPath = join(OUT_DIR, webpFileName);
      await sharp(inputPath)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80, effort: 6 })
        .toFile(webpPath);

      const webpStat = statSync(webpPath);
      totalOptBytes += webpStat.size;

      imageResults.variants[w] = {
        avif: { file: avifFileName, bytes: avifStat.size },
        webp: { file: webpFileName, bytes: webpStat.size },
      };

      console.log(`  w=${w} -> AVIF: ${(avifStat.size / 1024).toFixed(1)} KB | WebP: ${(webpStat.size / 1024).toFixed(1)} KB`);
    }

    results.push(imageResults);
  }

  console.log("\n====================================================");
  console.log(`Total Original Assets: ${(totalOrigBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total 36 Generated Variants: ${(totalOptBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Average Variant Size: ${(totalOptBytes / (IMAGE_MAP.length * WIDTHS.length * 2) / 1024).toFixed(1)} KB`);
  console.log("====================================================");
}

generate().catch(console.error);
