/**
 * Generates the Solenne favicon set from a single source image.
 *
 * Source of truth: `public/images/product/solenne_logo.png` (white matte).
 * Outputs (Next.js App Router file-based metadata), all with a transparent
 * background:
 *   app/favicon.ico     16, 32, 48 px — multi-resolution ICO with alpha
 *   app/icon.png        512 x 512 — modern browser icon
 *   app/apple-icon.png  180 x 180 — Apple touch icon
 *
 * Background removal is edge-connected, never a global white replacement:
 *   1. The artwork mask is eroded by a radius larger than the drawing's line
 *      weight, so hairline strokes become permeable while solid areas (the wax
 *      body, the flame fill) stay barriers. A flood fill from the image borders
 *      then reaches every white region that is only fenced in by a stroke — the
 *      outer canvas, the empty glass, the star and ribbon loops — and those
 *      become transparent. White details that sit inside a solid fill (flame
 *      highlight, wax reflections, glass highlights, decorative dots) are never
 *      reached and stay opaque. The dominant fill colour is barred outright as
 *      well, because the wax narrows to a neck that is wider than a stroke and
 *      would otherwise leak the fill into the swirl.
 *   2. A narrow band of anti-aliased pixels next to that background is
 *      decontaminated: each pixel is modelled as a blend of white and its
 *      nearest solid artwork colour, which recovers both the true alpha and the
 *      un-premultiplied foreground colour (no white fringe).
 *   3. The recovered colour is bled outward into the fully transparent area so
 *      downscaling never mixes white into the edges.
 *
 * The illustration is then trimmed to its artwork bounds and contained (never
 * cropped, never stretched) inside a transparent square with a small padding.
 *
 * Run: node scripts/generate-favicons.mjs
 */
import { statSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
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

const SOURCE = resolve("./public/images/product/solenne_logo.png");
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** A pixel counts as background only if every channel is this close to white. */
const BG_WHITE_MIN = 250;
/**
 * Artwork erosion radius (source pixels). It must exceed half the stroke weight
 * (~4.4 px, i.e. ~9 px lines) so strokes stop being barriers, and stay below the
 * inradius of solid fills (flame ~16.7 px, wax body far larger) so those keep
 * enclosing their white details.
 */
const STROKE_PERMEABILITY = 6;
/** Width (in source pixels) of the anti-aliased band that gets decontaminated. */
const BAND_RADIUS = 3;
/**
 * L1 RGB distance below which a pixel still counts as the dominant fill colour.
 * Flat illustration colours are exact; the tolerance only absorbs soft shading.
 */
const FILL_COLOR_TOLERANCE = 40;
/** Alpha below this is treated as background, above this as solid artwork. */
const ALPHA_CUTOFF = 0.02;
const ALPHA_SOLID = 0.995;
/** Padding around the illustration, as a fraction of the icon edge. */
const PAD_RATIO = 0.06;

const ICO_SIZES = [16, 32, 48];
const ICON_SIZE = 512;
const APPLE_ICON_SIZE = 180;

const OUTPUTS = [
  { file: "app/favicon.ico", kind: "ico" },
  { file: "app/icon.png", kind: "png", size: ICON_SIZE },
  { file: "app/apple-icon.png", kind: "png", size: APPLE_ICON_SIZE },
];

const NEIGHBOURS_4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const NEIGHBOURS_8 = [
  ...NEIGHBOURS_4,
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

/**
 * Finds the image's dominant non-white colour — the flat fill of the largest
 * solid shape (here: the wax body) — and returns a predicate matching pixels of
 * that colour. The fill must never be traversed by the background flood fill:
 * a thin neck of fill is still fill, not a stroke, and must not leak the fill
 * into white details enclosed by it (the wax swirl, the glass reflections).
 */
function detectFillBarrier(data, pixels, isWhite) {
  const histogram = new Map();

  for (let n = 0; n < pixels; n++) {
    if (isWhite(n)) continue;
    const p = n * 4;
    const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }

  let dominant = 0;
  let dominantCount = 0;
  for (const [key, count] of histogram) {
    if (count > dominantCount) {
      dominant = key;
      dominantCount = count;
    }
  }

  // A source without any sizeable fill has nothing to protect.
  if (dominantCount < pixels * 0.02) return () => false;

  const fillR = (dominant >> 16) & 0xff;
  const fillG = (dominant >> 8) & 0xff;
  const fillB = dominant & 0xff;

  return (n) => {
    const p = n * 4;
    return (
      Math.abs(data[p] - fillR) +
        Math.abs(data[p + 1] - fillG) +
        Math.abs(data[p + 2] - fillB) <
      FILL_COLOR_TOLERANCE
    );
  };
}

/**
 * Removes the surrounding white background and returns the trimmed RGBA artwork.
 */
async function buildTransparentArtwork() {
  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const pixels = width * height;
  const queue = new Int32Array(pixels);

  const isBackgroundSeed = (n) => {
    const p = n * 4;
    return (
      data[p] >= BG_WHITE_MIN &&
      data[p + 1] >= BG_WHITE_MIN &&
      data[p + 2] >= BG_WHITE_MIN
    );
  };

  // --- 1. Distance transform of the artwork (distance to the nearest white) --
  // White seeds the transform at 0, so every artwork pixel receives its
  // distance to the nearest white. Hairline strokes therefore stay within the
  // erosion radius while the interior of a solid fill grows beyond it.
  const artworkDistance = new Float32Array(pixels).fill(Infinity);

  for (let n = 0; n < pixels; n++) {
    if (isBackgroundSeed(n)) artworkDistance[n] = 0;
  }

  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const n = y * width + x;
      if (artworkDistance[n] === 0) continue;
      let best = artworkDistance[n];
      if (x > 0) best = Math.min(best, artworkDistance[n - 1] + 1);
      if (y > 0) best = Math.min(best, artworkDistance[n - width] + 1);
      if (x > 0 && y > 0) best = Math.min(best, artworkDistance[n - width - 1] + diagonal);
      if (x < width - 1 && y > 0) best = Math.min(best, artworkDistance[n - width + 1] + diagonal);
      artworkDistance[n] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const n = y * width + x;
      if (artworkDistance[n] === 0) continue;
      let best = artworkDistance[n];
      if (x < width - 1) best = Math.min(best, artworkDistance[n + 1] + 1);
      if (y < height - 1) best = Math.min(best, artworkDistance[n + width] + 1);
      if (x < width - 1 && y < height - 1)
        best = Math.min(best, artworkDistance[n + width + 1] + diagonal);
      if (x > 0 && y < height - 1)
        best = Math.min(best, artworkDistance[n + width - 1] + diagonal);
      artworkDistance[n] = best;
    }
  }

  // --- 2. Flood fill from the borders through the eroded artwork -------------
  // Eroded pixels are solid cores only: a flood fill may pass through plain
  // white (distance 0) and through hairline strokes (so it reaches the empty
  // glass and the loop holes) but never through the wax body or the flame fill
  // (so their white details survive).
  //
  // Thinness alone is not a safe test: the wax fill narrows to an ~11 px gap
  // between the top rim and the swirl, which is *wider* than the glass stroke,
  // so a distance-only rule would tunnel through the wax and delete the swirl.
  // The dominant non-white colour is therefore treated as a barrier everywhere,
  // even where the fill happens to be thin. Only the strokes (glass outline,
  // ribbons, star outlines) can be crossed.
  const isFill = detectFillBarrier(data, pixels, isBackgroundSeed);
  const isPermeable = (n) =>
    artworkDistance[n] <= STROKE_PERMEABILITY && !isFill(n);

  const reached = new Uint8Array(pixels);
  let head = 0;
  let tail = 0;

  const visit = (x, y) => {
    const n = y * width + x;
    if (reached[n] || !isPermeable(n)) return;
    reached[n] = 1;
    queue[tail++] = n;
  };

  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    visit(0, y);
    visit(width - 1, y);
  }

  while (head < tail) {
    const n = queue[head++];
    const x = n % width;
    const y = (n - x) / width;
    for (const [dx, dy] of NEIGHBOURS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      visit(nx, ny);
    }
  }

  // Only white pixels of the reached area are background; the strokes the fill
  // travelled through are artwork and must survive untouched.
  const background = new Uint8Array(pixels);
  for (let n = 0; n < pixels; n++) {
    if (reached[n] && isBackgroundSeed(n)) background[n] = 1;
  }

  // --- 3. Distance band around the background (anti-aliased edge pixels) ----
  const distance = new Uint8Array(pixels).fill(255);
  head = 0;
  tail = 0;
  for (let n = 0; n < pixels; n++) {
    if (background[n]) {
      distance[n] = 0;
      queue[tail++] = n;
    }
  }

  while (head < tail) {
    const n = queue[head++];
    const step = distance[n];
    if (step >= BAND_RADIUS) continue;
    const x = n % width;
    const y = (n - x) / width;
    for (const [dx, dy] of NEIGHBOURS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const m = ny * width + nx;
      if (distance[m] > step + 1) {
        distance[m] = step + 1;
        queue[tail++] = m;
      }
    }
  }

  // --- 4. Nearest solid artwork colour for every band pixel -----------------
  const nearest = new Int32Array(pixels).fill(-1);
  head = 0;
  tail = 0;
  for (let n = 0; n < pixels; n++) {
    if (!background[n] && distance[n] > BAND_RADIUS) {
      nearest[n] = n;
      queue[tail++] = n;
    }
  }

  while (head < tail) {
    const n = queue[head++];
    const source = nearest[n];
    const x = n % width;
    const y = (n - x) / width;
    for (const [dx, dy] of NEIGHBOURS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const m = ny * width + nx;
      if (nearest[m] !== -1) continue;
      nearest[m] = source;
      queue[tail++] = m;
    }
  }

  // --- 5. Compose alpha + un-premultiplied colour ---------------------------
  const out = Buffer.alloc(pixels * 4);

  for (let n = 0; n < pixels; n++) {
    const p = n * 4;

    if (background[n]) {
      out[p + 3] = 0;
      continue;
    }

    const solid = nearest[n] === -1 ? n : nearest[n];
    const inBand = distance[n] <= BAND_RADIUS;

    if (!inBand) {
      out[p] = data[p];
      out[p + 1] = data[p + 1];
      out[p + 2] = data[p + 2];
      out[p + 3] = 255;
      continue;
    }

    // Model the pixel as C = a*F + (1-a)*white and solve for a, F.
    const f = solid * 4;
    const dr = data[f] - 255;
    const dg = data[f + 1] - 255;
    const db = data[f + 2] - 255;
    const denominator = dr * dr + dg * dg + db * db;

    const cr = data[p] - 255;
    const cg = data[p + 1] - 255;
    const cb = data[p + 2] - 255;

    let alpha = denominator === 0 ? 1 : (cr * dr + cg * dg + cb * db) / denominator;
    if (alpha < 0) alpha = 0;
    if (alpha > 1) alpha = 1;

    if (alpha <= ALPHA_CUTOFF) {
      out[p + 3] = 0;
      continue;
    }

    if (alpha >= ALPHA_SOLID) {
      out[p] = data[p];
      out[p + 1] = data[p + 1];
      out[p + 2] = data[p + 2];
      out[p + 3] = 255;
      continue;
    }

    const unpremultiply = (channel, delta) =>
      Math.max(0, Math.min(255, Math.round(255 + delta / alpha)));

    out[p] = unpremultiply(data[p], cr);
    out[p + 1] = unpremultiply(data[p + 1], cg);
    out[p + 2] = unpremultiply(data[p + 2], cb);
    out[p + 3] = Math.round(alpha * 255);
  }

  // --- 6. Bleed colour into transparent pixels so scaling adds no white ------
  const filled = new Uint8Array(pixels);
  head = 0;
  tail = 0;
  for (let n = 0; n < pixels; n++) {
    if (out[n * 4 + 3] > 0) {
      filled[n] = 1;
      queue[tail++] = n;
    }
  }

  while (head < tail) {
    const n = queue[head++];
    const p = n * 4;
    const x = n % width;
    const y = (n - x) / width;
    for (const [dx, dy] of NEIGHBOURS_8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const m = ny * width + nx;
      if (filled[m]) continue;
      filled[m] = 1;
      const q = m * 4;
      out[q] = out[p];
      out[q + 1] = out[p + 1];
      out[q + 2] = out[p + 2];
      queue[tail++] = m;
    }
  }

  // --- 7. Trim to the artwork bounds ---------------------------------------
  if (process.env.FAVICON_DEBUG_MASTER) {
    writeFileSync(
      resolve(process.env.FAVICON_DEBUG_MASTER),
      await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer()
    );
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (out[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmed = Buffer.alloc(trimmedWidth * trimmedHeight * 4);

  for (let y = 0; y < trimmedHeight; y++) {
    const from = ((minY + y) * width + minX) * 4;
    out.copy(trimmed, y * trimmedWidth * 4, from, from + trimmedWidth * 4);
  }

  return { data: trimmed, width: trimmedWidth, height: trimmedHeight };
}

/** Renders one square, transparent, padded PNG buffer of the artwork. */
async function renderPng(artwork, size) {
  const pad = Math.round(size * PAD_RATIO);
  const inner = size - pad * 2;

  return sharp(artwork.data, {
    raw: { width: artwork.width, height: artwork.height, channels: 4 },
  })
    .resize(inner, inner, { fit: "contain", background: TRANSPARENT, kernel: "lanczos3" })
    .extend({
      top: pad,
      bottom: size - inner - pad,
      left: pad,
      right: size - inner - pad,
      background: TRANSPARENT,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * Assembles a valid multi-resolution ICO container (ICONDIR + ICONDIRENTRY
 * records + payloads). Each entry embeds an RGBA PNG, which browsers, Windows
 * Vista+ and macOS all accept — the file is a real ICO, not a renamed PNG.
 */
function buildIco(entries) {
  const HEADER_SIZE = 6;
  const ENTRY_SIZE = 16;

  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const directory = Buffer.alloc(ENTRY_SIZE * entries.length);
  let offset = HEADER_SIZE + directory.length;

  entries.forEach(({ size, png }, index) => {
    const entry = index * ENTRY_SIZE;
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 0); // width (0 means 256)
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1); // height
    directory.writeUInt8(0, entry + 2); // palette size
    directory.writeUInt8(0, entry + 3); // reserved
    directory.writeUInt16LE(1, entry + 4); // color planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });

  return Buffer.concat([header, directory, ...entries.map((e) => e.png)]);
}

async function generate() {
  console.log("=== Generating Solenne favicon set (transparent) ===");

  const source = statSync(SOURCE);
  const meta = await sharp(SOURCE).metadata();
  console.log(
    `Source: ${SOURCE.replace(process.cwd(), ".")} (${meta.width}x${meta.height}, ` +
      `${(source.size / 1024).toFixed(1)} KB)`
  );

  const artwork = await buildTransparentArtwork();
  console.log(
    `Artwork after background removal: ${artwork.width}x${artwork.height} ` +
      `(padding ${(PAD_RATIO * 100).toFixed(0)}% per side)`
  );

  const icoEntries = [];
  for (const size of ICO_SIZES) {
    icoEntries.push({ size, png: await renderPng(artwork, size) });
  }

  for (const output of OUTPUTS) {
    const target = resolve(output.file);
    mkdirSync(dirname(target), { recursive: true });

    if (output.kind === "ico") {
      const ico = buildIco(icoEntries);
      writeFileSync(target, ico);
      console.log(`  ${output.file} -> ${ICO_SIZES.join("/")} px, ${ico.length} B`);
      continue;
    }

    const png = await renderPng(artwork, output.size);
    writeFileSync(target, png);
    console.log(`  ${output.file} -> ${output.size}x${output.size}, ${png.length} B`);
  }

  console.log("Done.");
}

generate().catch((error) => {
  console.error(error);
  process.exit(1);
});
