/**
 * One-off vectoriser for the Solenne candle artwork.
 *
 * Source (read-only): public/images/brand/source/solenne_logo_removebackground.png
 * Output: components/experience/solenne-intro/solenne-intro-artwork.ts
 *
 * Produces
 *  - exact filled SVG paths for the four flat colour layers (orange, pink,
 *    white, brown) traced from the PNG's own pixels;
 *  - "reveal" centre-line paths used only as animation masks (glass rim,
 *    walls, bottom, wick, ribbons, ripples, stars, dots, flame silhouette).
 *
 * Run: node scripts/vectorize-solenne-logo.mjs [--preview]
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public/images/brand/source/solenne_logo_removebackground.png");
const OUT = path.join(ROOT, "components/experience/solenne-intro/solenne-intro-artwork.ts");
const PREVIEW_DIR = path.join(ROOT, ".local/solenne-intro/previews");

const PALETTE = {
  orange: [255, 165, 31],
  pink: [255, 153, 216],
  white: [255, 255, 255],
  brown: [85, 60, 38],
};

/* --------------------------------------------------------------- utilities */

function dilate(mask, W, H, r) {
  if (r <= 0) return mask.slice();
  const out = new Uint8Array(W * H);
  const offs = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy <= r * r + r) offs.push([dx, dy]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y * W + x]) continue;
    for (const [dx, dy] of offs) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) out[ny * W + nx] = 1;
    }
  }
  return out;
}
function erode(mask, W, H, r) {
  if (r <= 0) return mask.slice();
  const inv = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) inv[i] = mask[i] ? 0 : 1;
  const d = dilate(inv, W, H, r);
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = d[i] ? 0 : 1;
  return out;
}
function fillHoles(mask, W, H) {
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (outside[i] || mask[i]) return;
    outside[i] = 1; stack.push(i);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i - x) / W;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) out[i] = mask[i] || !outside[i] ? 1 : 0;
  return out;
}
function removeSmall(mask, W, H, minArea) {
  const seen = new Uint8Array(W * H);
  const out = mask.slice();
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || seen[i]) continue;
    stack.length = 0; stack.push(i); seen[i] = 1;
    const px = [];
    while (stack.length) {
      const p = stack.pop(); px.push(p);
      const x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (px.length < minArea) for (const p of px) out[p] = 0;
  }
  return out;
}

/* -------------------------------------------------------- contour tracing */

function traceAllContours(mask, W, H) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !!mask[y * W + x];
  const edges = new Map();
  const add = (ax, ay, bx, by) => {
    const k = `${ax},${ay}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push(`${bx},${by}`);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) add(x, y, x + 1, y);
    if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) add(x, y + 1, x, y);
  }
  const parse = (s) => s.split(",").map(Number);
  const used = new Set();
  const loops = [];
  const dirOf = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (dx === 1) return 0;
    if (dy === 1) return 1;
    if (dx === -1) return 2;
    return 3;
  };
  for (const [startKey, outs] of edges) {
    for (const firstOut of outs) {
      if (used.has(`${startKey}>${firstOut}`)) continue;
      const loop = [parse(startKey)];
      let prev = parse(startKey), cur = parse(firstOut);
      used.add(`${startKey}>${firstOut}`);
      let guard = 0;
      while (guard++ < W * H * 4) {
        loop.push(cur);
        if (`${cur[0]},${cur[1]}` === startKey) break;
        const candidates = (edges.get(`${cur[0]},${cur[1]}`) || []).filter(
          (o) => !used.has(`${cur[0]},${cur[1]}>${o}`)
        );
        if (!candidates.length) break;
        let next;
        if (candidates.length === 1) next = candidates[0];
        else {
          const inDir = dirOf(prev, cur);
          let bestTurn = -Infinity;
          for (const c of candidates) {
            const outDir = dirOf(cur, parse(c));
            const turn = (inDir - outDir + 4) % 4;
            if (turn > bestTurn) { bestTurn = turn; next = c; }
          }
        }
        used.add(`${cur[0]},${cur[1]}>${next}`);
        prev = cur; cur = parse(next);
        if (`${cur[0]},${cur[1]}` === startKey) { loop.push(cur); break; }
      }
      if (loop.length > 4) loops.push(loop);
    }
  }
  return loops;
}
function polyArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length - 1; i++) a += loop[i][0] * loop[i + 1][1] - loop[i + 1][0] * loop[i][1];
  return a / 2;
}
function rdp(points, epsilon) {
  if (points.length < 3) return points.slice();
  const sq = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return (p[0] - a[0]) ** 2 + (p[1] - a[1]) ** 2;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return (p[0] - (a[0] + t * dx)) ** 2 + (p[1] - (a[1] + t * dy)) ** 2;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = sq(points[i], points[s], points[e]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx !== -1 && maxD > epsilon * epsilon) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return points.filter((_, i) => keep[i]);
}
const f = (v) => Math.round(v * 100) / 100;

function smoothClosed(points, { cornerAngle = 62, tension = 1 } = {}) {
  const pts = points.slice();
  if (pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const n = pts.length;
  if (n < 3) return "";
  const corner = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1) || 1, l2 = Math.hypot(...v2) || 1;
    const dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
    if (Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI > cornerAngle) corner[i] = true;
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i <= n; i++) {
    const idx = i % n;
    if (corner[idx]) { d += `L${f(pts[idx][0])} ${f(pts[idx][1])}`; continue; }
    const p0 = pts[(idx - 2 + n) % n], p1 = pts[(idx - 1 + n) % n], p2 = pts[idx], p3 = pts[(idx + 1) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + "Z";
}
function smoothOpen(points, { cornerAngle = 85 } = {}) {
  if (points.length < 2) return "";
  const simplified = rdp(points, 0.9);
  const n = simplified.length;
  if (n < 2) return "";
  const corner = new Array(n).fill(false);
  for (let i = 1; i < n - 1; i++) {
    const a = simplified[i - 1], b = simplified[i], c = simplified[i + 1];
    const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const l1 = Math.hypot(...v1) || 1, l2 = Math.hypot(...v2) || 1;
    const dot = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
    if (Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI > cornerAngle) corner[i] = true;
  }
  let d = `M${f(simplified[0][0])} ${f(simplified[0][1])}`;
  for (let i = 1; i < n; i++) {
    if (corner[i] || i === n - 1) { d += `L${f(simplified[i][0])} ${f(simplified[i][1])}`; continue; }
    const p0 = simplified[i - 1], p1 = simplified[i], p2 = simplified[i + 1];
    const c1 = [p0[0] + (p1[0] - simplified[Math.max(0, i - 2)][0]) / 6, p0[1] + (p1[1] - simplified[Math.max(0, i - 2)][1]) / 6];
    const c2 = [p1[0] - (p2[0] - p0[0]) / 6, p1[1] - (p2[1] - p0[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p1[0])} ${f(p1[1])}`;
  }
  return d;
}
function maskToPath(mask, W, H, { epsilon = 0.85, cornerAngle = 62, minArea = 12 } = {}) {
  const loops = traceAllContours(mask, W, H);
  const parts = [];
  for (const loop of loops) {
    if (Math.abs(polyArea(loop)) < minArea) continue;
    const d = smoothClosed(rdp(loop, epsilon), { cornerAngle });
    if (d) parts.push(d);
  }
  return parts.join("");
}

/* --------------------------------------------------------------- skeleton */

function skeletonize(mask, W, H) {
  const img = mask.slice();
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : img[y * W + x]);
  let changed = true, guard = 0;
  const remove = [];
  while (changed && guard++ < 200) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      remove.length = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (!img[y * W + x]) continue;
        const p2 = get(x, y - 1), p3 = get(x + 1, y - 1), p4 = get(x + 1, y),
          p5 = get(x + 1, y + 1), p6 = get(x, y + 1), p7 = get(x - 1, y + 1),
          p8 = get(x - 1, y), p9 = get(x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0;
        for (let k = 0; k < 8; k++) if (!seq[k] && seq[k + 1]) A++;
        if (A !== 1) continue;
        if (step === 0) {
          if (p2 && p4 && p6) continue;
          if (p4 && p6 && p8) continue;
        } else {
          if (p2 && p4 && p8) continue;
          if (p2 && p6 && p8) continue;
        }
        remove.push(y * W + x);
      }
      for (const p of remove) img[p] = 0;
      if (remove.length) changed = true;
    }
  }
  // Thin 2px-wide remnants: remove "simple" pixels whose 8-neighbourhood
  // stays connected without them. This keeps genuine junctions intact.
  let thinned = true, guard2 = 0;
  while (thinned && guard2++ < 100) {
    thinned = false;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (!img[y * W + x]) continue;
      const nbs = [];
      for (const [dx, dy] of N8) if (img[(y + dy) * W + (x + dx)]) nbs.push([x + dx, y + dy]);
      if (nbs.length < 2) continue;
      // count 8-connected components among neighbours
      const set = new Set(nbs.map(([nx, ny]) => `${nx},${ny}`));
      const seen = new Set();
      let comps = 0;
      for (const [nx, ny] of nbs) {
        const k = `${nx},${ny}`;
        if (seen.has(k)) continue;
        comps++;
        const stack = [[nx, ny]]; seen.add(k);
        while (stack.length) {
          const [cx, cy] = stack.pop();
          for (const [dx, dy] of N8) {
            const kk = `${cx + dx},${cy + dy}`;
            if (set.has(kk) && !seen.has(kk)) { seen.add(kk); stack.push([cx + dx, cy + dy]); }
          }
        }
      }
      if (comps === 1) { img[y * W + x] = 0; thinned = true; }
    }
  }
  return img;
}

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

/**
 * Branch graph of a skeleton, with direction-continuity pairing at junctions.
 * Returns long polylines that pass straight through self-crossings.
 */
function skeletonPolylines(skel, W, H, { minBranch = 6 } = {}) {
  const pix = [];
  for (let i = 0; i < W * H; i++) if (skel[i]) pix.push(i);
  const pixSet = new Set(pix);
  const nb = (i) => {
    const x = i % W, y = (i - x) / W;
    const out = [];
    for (const [dx, dy] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (pixSet.has(q)) out.push(q);
    }
    return out;
  };
  const deg = new Map();
  for (const p of pix) deg.set(p, nb(p).length);

  // prune short leaf spurs
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of [...pixSet]) {
      if (deg.get(p) !== 1) continue;
      const chain = [p];
      let prev = -1, cur = p;
      while (chain.length <= minBranch) {
        const nexts = nb(cur).filter((n) => n !== prev);
        if (nexts.length !== 1) break;
        prev = cur; cur = nexts[0];
        if (deg.get(cur) !== 2) { chain.push(cur); break; }
        chain.push(cur);
      }
      if (chain.length <= minBranch && deg.get(chain[chain.length - 1]) > 2) {
        for (const c of chain.slice(0, -1)) { pixSet.delete(c); deg.delete(c); }
        changed = true;
      }
    }
    if (changed) {
      for (const p of pixSet) deg.set(p, nb(p).length);
    }
  }

  const nodes = [...pixSet].filter((p) => deg.get(p) !== 2);
  const usedEdges = new Set();
  const key = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const edges = [];
  const walk = (start, first) => {
    const chain = [start, first];
    usedEdges.add(key(start, first));
    let prev = start, cur = first;
    while (deg.get(cur) === 2) {
      const next = nb(cur).find((n) => n !== prev);
      if (next === undefined) break;
      const k = key(cur, next);
      if (usedEdges.has(k)) break;
      usedEdges.add(k);
      prev = cur; cur = next; chain.push(cur);
    }
    return chain;
  };
  for (const node of nodes) {
    for (const n of nb(node)) {
      if (usedEdges.has(key(node, n))) continue;
      edges.push(walk(node, n));
    }
  }
  // pure loops
  const seen = new Set();
  for (const e of edges) for (const p of e) seen.add(p);
  for (const p of pixSet) {
    if (seen.has(p) || deg.get(p) !== 2) continue;
    const chain = [p]; seen.add(p);
    let prev = -1, cur = p;
    while (true) {
      const next = nb(cur).find((n) => n !== prev && !seen.has(n));
      if (next === undefined) break;
      seen.add(next); chain.push(next); prev = cur; cur = next;
    }
    if (chain.length > minBranch) edges.push(chain);
  }

  // tangent direction of an edge leaving a node
  const dirAt = (chain, fromStart) => {
    const n = Math.min(6, chain.length - 1);
    const a = fromStart ? chain[0] : chain[chain.length - 1];
    const b = fromStart ? chain[n] : chain[chain.length - 1 - n];
    const ax = a % W, ay = (a - ax) / W, bx = b % W, by = (b - bx) / W;
    const v = [bx - ax, by - ay];
    const l = Math.hypot(...v) || 1;
    return [v[0] / l, v[1] / l];
  };
  const incident = new Map();
  edges.forEach((e, ei) => {
    for (const [end, fromStart] of [[e[0], true], [e[e.length - 1], false]]) {
      if (deg.get(end) === 2) continue;
      if (!incident.has(end)) incident.set(end, []);
      incident.get(end).push({ ei, fromStart, dir: dirAt(e, fromStart) });
    }
  });
  const pairAt = new Map(); // `${node}:${ei}` -> next ei
  for (const [node, list] of incident) {
    const rem = list.slice();
    while (rem.length >= 2) {
      let best = null, bestScore = Infinity;
      for (let i = 0; i < rem.length; i++) for (let j = i + 1; j < rem.length; j++) {
        const score = rem[i].dir[0] * rem[j].dir[0] + rem[i].dir[1] * rem[j].dir[1];
        if (score < bestScore) { bestScore = score; best = [i, j]; }
      }
      const [i, j] = best;
      const A = rem[i], B = rem[j];
      pairAt.set(`${node}:${A.ei}:${A.fromStart}`, { ei: B.ei, fromStart: B.fromStart });
      pairAt.set(`${node}:${B.ei}:${B.fromStart}`, { ei: A.ei, fromStart: A.fromStart });
      rem.splice(j, 1); rem.splice(i, 1);
    }
  }

  const used = new Set();
  const paths = [];
  for (let ei = 0; ei < edges.length; ei++) {
    if (used.has(ei)) continue;
    const pathPix = [];
    let cur = ei, fromStart = true;
    // walk backwards first
    let guard = 0;
    while (guard++ < 500) {
      used.add(cur);
      const chain = edges[cur];
      const pts = fromStart ? chain : chain.slice().reverse();
      pathPix.push(...pts);
      const endNode = fromStart ? chain[chain.length - 1] : chain[0];
      const link = pairAt.get(`${endNode}:${cur}:${!fromStart}`);
      if (!link || used.has(link.ei)) break;
      cur = link.ei;
      fromStart = link.fromStart;
    }
    if (pathPix.length > minBranch) paths.push(pathPix.map((p) => [p % W, Math.floor(p / W)]));
  }
  return paths;
}

/* --------------------------------------------------------------- main flow */

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels;

const masks = {};
for (const k of Object.keys(PALETTE)) masks[k] = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const o = i * C;
  if (data[o + 3] < 128) continue;
  const r = data[o], g = data[o + 1], b = data[o + 2];
  let best = null, bd = Infinity;
  for (const [k, c] of Object.entries(PALETTE)) {
    const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  masks[best][i] = 1;
}

const orange = removeSmall(masks.orange, W, H, 10);
const white = removeSmall(masks.white, W, H, 10);
const brown = removeSmall(masks.brown, W, H, 10);
let pink = masks.pink;
pink = dilate(pink, W, H, 6);
pink = erode(pink, W, H, 6);
pink = fillHoles(pink, W, H);

/* white layer split: ripples / flame highlight / base */
function whiteGroups(mask, W, H) {
  const comps = [];
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || seen[i]) continue;
    stack.length = 0; stack.push(i); seen[i] = 1;
    const px = [];
    let minx = W, miny = H, maxx = 0, maxy = 0;
    while (stack.length) {
      const p = stack.pop(); px.push(p);
      const x = p % W, y = (p - x) / W;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (mask[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    comps.push({ px, minx, miny, maxx, maxy, area: px.length });
  }
  const groups = { ripples: new Uint8Array(W * H), flame: new Uint8Array(W * H), base: new Uint8Array(W * H) };
  for (const c of comps) {
    const isFlame = c.miny < 210;
    const isRipple = c.minx > 250 && c.maxx < 450 && c.miny > 250 && c.maxy < 365;
    const g = isFlame ? groups.flame : isRipple ? groups.ripples : groups.base;
    for (const p of c.px) g[p] = 1;
  }
  return groups;
}
const whites = whiteGroups(white, W, H);

/* flame silhouette mask (orange inside the flame box) */
const flameMask = new Uint8Array(W * H);
for (let y = 0; y < 222; y++) for (let x = 292; x <= 408; x++) {
  const i = y * W + x;
  if (orange[i]) flameMask[i] = 1;
}
const flameClosed = fillHoles(flameMask, W, H);

/* ------------------------------------------------------------- reveal art */

const skelO = skeletonize(orange, W, H);

function runsColumn(mask, x, y0, y1) {
  const out = [];
  let s = -1;
  for (let y = y0; y <= y1; y++) {
    const v = mask[y * W + x];
    if (v && s < 0) s = y;
    if (!v && s >= 0) { out.push([s, y - 1]); s = -1; }
  }
  if (s >= 0) out.push([s, y1]);
  return out;
}

/* rim: top (back) arc + front arc sampled per column.
   The flame is painted over the rim, so the traced flame silhouette must never
   feed the rim mask: while the glass is still drawing the flame layer is
   hidden, and any flame pixel picked up by the rim stroke surfaces as an orange
   crown at the rim's centre. A clean rim run is ~9-11px tall; where the flame
   merges into the rim the run is far thicker, so those columns are dropped and
   the back arc stops at the flame's edges — the same span the flame hides in
   the original artwork. The front arc sits below the flame, so it is bridged
   smoothly across that span (and across the ribbon that touches the rim near
   x = 447, a separate stroke, not part of the rim). */
const RIM_HALF = 6.5;
const RIM_RUN_MAX = 16;
const FLAME_X0 = 275, FLAME_X1 = 405, FLAME_SPLIT = 350;
const RIBBON_RIM_GAP = [435, 455];
const topArc = [], frontArc = [];
for (let x = 10; x <= W - 11; x++) {
  const rs = runsColumn(orange, x, 0, 232);
  if (!rs.length) continue;
  const top = rs[0];
  const inFlameBox = x >= FLAME_X0 && x <= FLAME_X1;
  /* drop columns where the flame and the rim share one run: their top edge is
     no longer the rim, and sampling it would reveal the flame */
  if (!(inFlameBox && top[1] - top[0] > RIM_RUN_MAX)) {
    topArc.push([x, top[0] + RIM_HALF]);
  }
  if (inFlameBox) continue; // bridged below
  if (x >= RIBBON_RIM_GAP[0] && x <= RIBBON_RIM_GAP[1]) continue;
  /* the second run is the rim's front arc; a single run whose bottom stays in the
     rim band means rim + wall merged at the left/right cap */
  if (rs[1]) frontArc.push([x, (rs[1][0] + rs[1][1]) / 2]);
  else if (top[1] <= 205) frontArc.push([x, top[1] - RIM_HALF]);
}

/* bridge the skipped spans with a straight line between the clean samples on
   either side, so the mask stays one smooth ellipse instead of following the
   flame or the ribbon attachment */
const bridgeArc = (points, [x0, x1]) => {
  const left = points.filter((p) => p[0] < x0).at(-1);
  const right = points.find((p) => p[0] > x1);
  if (!left || !right) return points;
  for (let x = x0; x <= x1; x++) {
    const t = (x - left[0]) / (right[0] - left[0]);
    points.push([x, left[1] + (right[1] - left[1]) * t]);
  }
  return points.sort((a, b) => a[0] - b[0]);
};
bridgeArc(frontArc, [FLAME_X0, FLAME_X1]);
bridgeArc(frontArc, RIBBON_RIM_GAP);
const topLeft = topArc.filter((p) => p[0] <= FLAME_SPLIT);
const topRight = topArc.filter((p) => p[0] > FLAME_SPLIT);
const frontLeft = frontArc.filter((p) => p[0] <= FLAME_SPLIT);
const frontRight = frontArc.filter((p) => p[0] > FLAME_SPLIT);
const rimLeft = [...topLeft.slice().reverse(), ...frontLeft];
const rimRight = [...topRight, ...frontRight.slice().reverse()];

/* walls + bottom from the skeleton (outermost pixel per row/column, then smoothed) */
const movingAverage = (pts, window = 9) => {
  const half = Math.floor(window / 2);
  return pts.map((p, i) => {
    let sx = 0, sy = 0, n = 0;
    for (let k = -half; k <= half; k++) {
      const q = pts[i + k];
      if (!q) continue;
      sx += q[0]; sy += q[1]; n++;
    }
    return [sx / n, sy / n];
  });
};
const decimate = (pts, step) => pts.filter((_, i) => i % step === 0 || i === pts.length - 1);

const wallLRaw = [], wallRRaw = [];
for (let y = 150; y < 726; y++) {
  let minX = -1, maxX = -1;
  for (let x = 0; x < 48; x++) if (skelO[y * W + x]) { minX = x; break; }
  for (let x = W - 1; x >= 648; x--) if (skelO[y * W + x]) { maxX = x; break; }
  /* the left ribbon touches the wall around y 382-404 and kinks the edge trace */
  if (minX >= 0 && !(y >= 382 && y <= 404)) wallLRaw.push([minX, y]);
  if (maxX >= 0) wallRRaw.push([maxX, y]);
}
const wallL = decimate(movingAverage(wallLRaw), 7);
const wallR = decimate(movingAverage(wallRRaw), 7);

/* bottom: the lowest orange pixel per column minus half the stroke width. Using the
   mask instead of the skeleton keeps the rounded bottom corners intact, where the
   wall and the bottom arc merge into a single blob. */
const bottomRaw = [];
for (let x = 0; x < W; x++) {
  let maxY = -1;
  for (let y = 640; y < H; y++) if (orange[y * W + x]) maxY = Math.max(maxY, y);
  if (maxY > 0) bottomRaw.push([x, maxY - RIM_HALF]);
}
const bottomPts = decimate(movingAverage(bottomRaw), 7);

/* wick */
const skelB = skeletonize(brown, W, H);
const wickPts = [];
for (let y = 0; y < H; y++) {
  const xs = [];
  for (let x = 0; x < W; x++) if (skelB[y * W + x]) xs.push(x);
  if (xs.length) wickPts.push([xs.reduce((a, b) => a + b, 0) / xs.length, y]);
}

/* ripples */
const skelW = skeletonize(whites.ripples, W, H);
const ripplePaths = skeletonPolylines(skelW, W, H, { minBranch: 5 })
  .map((p) => smoothOpen(p))
  .filter(Boolean);

/* ribbons: cut attachments, then trace the isolated stroke skeletons */
const cut = orange.slice();
for (const [cx, cy, r] of [[20, 390, 7], [196, 779, 13], [447, 197, 13], [672, 567, 7]]) {
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) cut[y * W + x] = 0;
    }
  }
}
const cutComps = [];
{
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!cut[i] || seen[i]) continue;
    stack.length = 0; stack.push(i); seen[i] = 1;
    const px = [];
    while (stack.length) {
      const p = stack.pop(); px.push(p);
      const x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (cut[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    cutComps.push(px);
  }
}
const seeds = [[150, 535], [503, 360]];
const ribbonMasks = cutComps.filter((px) => {
  const set = new Set(px);
  return seeds.some(([sx, sy]) => set.has(sy * W + sx));
});
const ribbonPaths = [];
const ribbonPointSets = [];
for (const px of ribbonMasks) {
  const m = new Uint8Array(W * H);
  for (const p of px) m[p] = 1;
  const sk = skeletonize(m, W, H);
  for (const p of skeletonPolylines(sk, W, H, { minBranch: 4 })) {
    if (p.length > 5) ribbonPointSets.push(p);
  }
}
// join fragments whose endpoints meet and whose tangents agree
function joinFragments(sets, maxGap = 9, maxAngle = 75) {
  const remaining = sets.slice();
  const out = [];
  const endDir = (pts, atEnd) => {
    const n = Math.min(6, pts.length - 1);
    const a = atEnd ? pts[pts.length - 1] : pts[0];
    const b = atEnd ? pts[pts.length - 1 - n] : pts[n];
    const v = [a[0] - b[0], a[1] - b[1]];
    const l = Math.hypot(...v) || 1;
    return [v[0] / l, v[1] / l];
  };
  while (remaining.length) {
    let cur = remaining.shift();
    let joined = true;
    while (joined) {
      joined = false;
      const curEnd = cur[cur.length - 1];
      const curDir = endDir(cur, true);
      let best = null, bestScore = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i];
        for (const reversed of [false, true]) {
          const start = reversed ? p[p.length - 1] : p[0];
          const gap = Math.hypot(start[0] - curEnd[0], start[1] - curEnd[1]);
          if (gap > maxGap) continue;
          const dir = endDir(p, reversed);
          const dot = curDir[0] * dir[0] + curDir[1] * dir[1];
          if (dot < Math.cos((maxAngle * Math.PI) / 180)) continue;
          const score = gap - dot * 2;
          if (score < bestScore) { bestScore = score; best = { i, reversed }; }
        }
      }
      if (best) {
        const p = remaining.splice(best.i, 1)[0];
        cur = cur.concat(best.reversed ? p.slice().reverse() : p);
        joined = true;
      }
    }
    out.push(cur);
  }
  return out;
}
for (const pts of joinFragments(ribbonPointSets, 18, 110)) {
  const d = smoothOpen(pts);
  if (d) ribbonPaths.push(d);
}

/* stars: hand-built centre lines from measured tips */
function tipsIn(box, n) {
  const { x0, y0, x1, y1 } = box;
  const pts = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (orange[y * W + x]) pts.push([x, y]);
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const bins = 360;
  const profile = new Array(bins).fill(0);
  for (const p of pts) {
    const a = Math.atan2(p[1] - cy, p[0] - cx);
    const bi = Math.floor(((a + Math.PI) / (2 * Math.PI)) * bins) % bins;
    const d = Math.hypot(p[0] - cx, p[1] - cy);
    if (d > profile[bi]) profile[bi] = d;
  }
  // circular smoothing
  const smooth = profile.map((_, i) => {
    let s = 0;
    for (let k = -4; k <= 4; k++) s += profile[(i + k + bins) % bins];
    return s / 9;
  });
  const maxima = [];
  for (let i = 0; i < bins; i++) {
    const prev = smooth[(i - 1 + bins) % bins], next = smooth[(i + 1) % bins];
    if (smooth[i] > prev && smooth[i] >= next) maxima.push({ i, d: smooth[i] });
  }
  maxima.sort((a, b) => b.d - a.d);
  const chosen = [];
  for (const m of maxima) {
    if (chosen.every((c) => {
      const diff = Math.abs(c.i - m.i);
      return Math.min(diff, bins - diff) > 22;
    })) chosen.push(m);
    if (chosen.length === n) break;
  }
  const tips = chosen.map((m) => {
    const a = (m.i / bins) * 2 * Math.PI - Math.PI;
    return [cx + Math.cos(a) * m.d, cy + Math.sin(a) * m.d];
  });
  return { cx, cy, tips };
}
const star5 = tipsIn({ x0: 45, y0: 195, x1: 120, y1: 292 }, 5);
const star4R = tipsIn({ x0: 588, y0: 190, x1: 670, y1: 280 }, 4);
const star4C = tipsIn({ x0: 186, y0: 480, x1: 265, y1: 572 }, 4);

function sparklePath({ cx, cy, tips }) {
  const pts = tips.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  if (pts.length < 4) return "";
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const c = [mx + (cx - mx) * 0.55, my + (cy - my) * 0.55];
    d += `Q${f(c[0])} ${f(c[1])} ${f(b[0])} ${f(b[1])}`;
  }
  return d + "Z";
}
const sparkleR = sparklePath(star4R);
const sparkleC = sparklePath(star4C);

function pentagramPath({ cx, cy, tips }) {
  if (tips.length < 5) return "";
  const sorted = tips.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  let d = `M${f(sorted[0][0])} ${f(sorted[0][1])}`;
  for (let i = 1; i <= 5; i++) {
    const p = sorted[(i * 2) % 5];
    d += `L${f(p[0])} ${f(p[1])}`;
  }
  return d + "Z";
}
const star5Path = pentagramPath(star5);

/* dots */
const dotList = [];
{
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!orange[i] || seen[i]) continue;
    stack.length = 0; stack.push(i); seen[i] = 1;
    const px = [];
    while (stack.length) {
      const p = stack.pop(); px.push(p);
      const x = p % W, y = (p - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (orange[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    if (px.length < 320) {
      const xs = px.map((p) => p % W), ys = px.map((p) => Math.floor(p / W));
      dotList.push({
        cx: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1),
        cy: +(ys.reduce((a, b) => a + b, 0) / ys.length).toFixed(1),
        r: +Math.sqrt(px.length / Math.PI).toFixed(1),
      });
    }
  }
}

/* --------------------------------------------------------------- artwork */

const art = {
  pink: maskToPath(pink, W, H, { epsilon: 1.0 }),
  whiteBase: maskToPath(whites.base, W, H, { epsilon: 0.8 }),
  ripples: maskToPath(whites.ripples, W, H, { epsilon: 0.7 }),
  flameHighlight: maskToPath(whites.flame, W, H, { epsilon: 0.7 }),
  orange: maskToPath(orange, W, H, { epsilon: 0.8 }),
  brown: maskToPath(brown, W, H, { epsilon: 0.7 }),
};

/* --- traced-edge correction ------------------------------------------------
 * The flattened source is about a pixel ragged where the flame's lower-right
 * edge meets the rim just right of the wick. The tracer reproduced that jog as
 * a two-pixel step, which reads as a small spur at the centre of the top rim.
 * Replace that run with one smooth curve that follows the source silhouette;
 * the rest of the trace is untouched.
 */
const RIM_EDGE_ARTIFACT =
  "L369 205C357.67 205.5 368.83 206.5 368 207C367.17 207.5 364.83 207.5 364 208C363.17 208.5 365.83 209 363 210L347 214";
const RIM_EDGE_SMOOTH = "L369 204.6C363 207.2 355 212.4 347 212.6";
if (!art.orange.includes(RIM_EDGE_ARTIFACT)) {
  throw new Error(
    "the orange rim-edge artefact moved: re-inspect the trace before regenerating",
  );
}
art.orange = art.orange.replace(RIM_EDGE_ARTIFACT, RIM_EDGE_SMOOTH);

/* keep every mask centre-line inside the canvas so a 13px stroke still covers
   artwork that is clipped by the image edge */
const clampPts = (pts, pad = 3) =>
  pts.map(([x, y]) => [Math.min(W - pad, Math.max(pad, x)), Math.min(H - pad, Math.max(pad, y))]);

const reveal = {
  rimLeft: smoothOpen(clampPts(rimLeft)),
  rimRight: smoothOpen(clampPts(rimRight)),
  wallLeft: smoothOpen(clampPts(wallL)),
  wallRight: smoothOpen(clampPts(wallR)),
  bottom: smoothOpen(clampPts(bottomPts)),
  wick: smoothOpen(wickPts),
  ribbons: ribbonPaths,
  ripples: ripplePaths,
  star5: star5Path,
  sparkleRight: sparkleR,
  sparkleCenter: sparkleC,
  flame: maskToPath(flameClosed, W, H, { epsilon: 0.9 }),
  dots: dotList,
};

const ts = `// AUTO-GENERATED by scripts/vectorize-solenne-logo.mjs — do not edit by hand.
// Traced from public/images/brand/source/solenne_logo_removebackground.png (696×800).
// The artwork paths are pixel-accurate silhouettes of the original PNG; the
// reveal paths are centre lines used only as animation masks.
export const ART_WIDTH = 696;
export const ART_HEIGHT = 800;
export const ART_COLORS = {
  orange: "#FFA51F",
  pink: "#FF99D8",
  white: "#FFFFFF",
  brown: "#553C26",
} as const;

export const ARTWORK = {
  pink: ${JSON.stringify(art.pink)},
  whiteBase: ${JSON.stringify(art.whiteBase)},
  ripples: ${JSON.stringify(art.ripples)},
  flameHighlight: ${JSON.stringify(art.flameHighlight)},
  orange: ${JSON.stringify(art.orange)},
  brown: ${JSON.stringify(art.brown)},
} as const;

export const REVEAL = {
  rimLeft: ${JSON.stringify(reveal.rimLeft)},
  rimRight: ${JSON.stringify(reveal.rimRight)},
  wallLeft: ${JSON.stringify(reveal.wallLeft)},
  wallRight: ${JSON.stringify(reveal.wallRight)},
  bottom: ${JSON.stringify(reveal.bottom)},
  wick: ${JSON.stringify(reveal.wick)},
  ribbons: ${JSON.stringify(reveal.ribbons)},
  ripples: ${JSON.stringify(reveal.ripples)},
  star5: ${JSON.stringify(reveal.star5)},
  sparkleRight: ${JSON.stringify(reveal.sparkleRight)},
  sparkleCenter: ${JSON.stringify(reveal.sparkleCenter)},
  flame: ${JSON.stringify(reveal.flame)},
  dots: ${JSON.stringify(reveal.dots)},
} as const;
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, ts);
console.log("art sizes", Object.fromEntries(Object.entries(art).map(([k, v]) => [k, v.length])));
console.log("ribbon paths", reveal.ribbons.length, reveal.ribbons.map((p) => p.length));
console.log("ripple paths", reveal.ripples.length);
console.log("dots", reveal.dots);
console.log("wrote", OUT);

/* --------------------------------------------------------------- preview */

if (process.argv.includes("--maskcheck")) {
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 696 800" width="696" height="800">
<rect width="696" height="800" fill="#000"/>
<g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
  <path d="${reveal.rimLeft}" stroke-width="13"/>
  <path d="${reveal.rimRight}" stroke-width="13"/>
  <path d="${reveal.wallLeft}" stroke-width="13"/>
  <path d="${reveal.wallRight}" stroke-width="13"/>
  <path d="${reveal.bottom}" stroke-width="13"/>
  <path d="${reveal.wick}" stroke-width="10"/>
  ${reveal.ribbons.map((p) => `<path d="${p}" stroke-width="12"/>`).join("")}
  <path d="${reveal.star5}" stroke-width="14"/>
  <path d="${reveal.sparkleRight}" stroke-width="14"/>
  <path d="${reveal.sparkleCenter}" stroke-width="14"/>
</g>
<path d="${reveal.flame}" fill="#fff"/>
${reveal.dots.map((d) => `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r + 3}" fill="#fff"/>`).join("")}
</svg>`;
  const png = await sharp(Buffer.from(maskSvg)).raw().toBuffer({ resolveWithObject: true });
  let uncovered = 0, total = 0;
  const missMask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!orange[y * W + x]) continue;
    total++;
    const o = (y * png.info.width + x) * png.info.channels;
    if (png.data[o] < 128) { uncovered++; missMask[y * W + x] = 1; }
  }
  console.log(`mask coverage: ${(100 * (1 - uncovered / total)).toFixed(2)}% (${uncovered}/${total} orange px uncovered)`);
  /* cluster the misses so every gap is reported, not just the first 40 px */
  const seenMiss = new Uint8Array(W * H);
  const clusters = [];
  for (let i = 0; i < W * H; i++) {
    if (!missMask[i] || seenMiss[i]) continue;
    const stack = [i];
    seenMiss[i] = 1;
    let minx = W, miny = H, maxx = 0, maxy = 0, n = 0;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W;
      n++;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (missMask[q] && !seenMiss[q]) { seenMiss[q] = 1; stack.push(q); }
      }
    }
    clusters.push({ n, minx, miny, maxx, maxy });
  }
  clusters.sort((a, b) => b.n - a.n);
  console.log("miss clusters:", JSON.stringify(clusters));
  /* how much of the flame path itself is missing (isolates flame-mask gaps from rim gaps) */
  const flameSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 696 800" width="696" height="800">
<rect width="696" height="800" fill="#000"/><path d="${reveal.flame}" fill="#fff"/></svg>`;
  const flamePng = await sharp(Buffer.from(flameSvg)).raw().toBuffer({ resolveWithObject: true });
  let flameMiss = 0, flameTotal = 0, flameOutsideBox = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!orange[y * W + x]) continue;
    const inBox = y < 222 && x >= 292 && x <= 408;
    if (!inBox) continue;
    flameTotal++;
    const o = (y * flamePng.info.width + x) * flamePng.info.channels;
    if (flamePng.data[o] < 128) { flameMiss++; if (missMask[y * W + x]) flameOutsideBox++; }
  }
  console.log(`flame-path coverage of orange inside flame box: ${(100 * (1 - flameMiss / flameTotal)).toFixed(2)}% (${flameMiss}/${flameTotal})`);
  console.log("flame-path misses also uncovered by the full mask:", flameOutsideBox);
}

if (process.argv.includes("--preview")) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 696 800" width="696" height="800">
<rect width="696" height="800" fill="#F8F4ED"/>
<path d="${art.pink}" fill="#FF99D8" fill-rule="evenodd"/>
<path d="${art.whiteBase}" fill="#FFFFFF" fill-rule="evenodd"/>
<path d="${art.ripples}" fill="#FFFFFF" fill-rule="evenodd"/>
<path d="${art.orange}" fill="#FFA51F" fill-rule="evenodd"/>
<path d="${art.brown}" fill="#553C26" fill-rule="evenodd"/>
<path d="${art.flameHighlight}" fill="#FFFFFF" fill-rule="evenodd"/>
<g fill="none" stroke="#0044ff" stroke-width="2">
  <path d="${reveal.rimLeft}"/>
  <path d="${reveal.rimRight}"/>
  <path d="${reveal.wallLeft}" stroke="#ff00aa"/>
  <path d="${reveal.wallRight}" stroke="#ff00aa"/>
  <path d="${reveal.bottom}" stroke="#00aa00"/>
  <path d="${reveal.wick}" stroke="#000"/>
  ${reveal.ribbons.map((p) => `<path d="${p}" stroke="#7a00ff"/>`).join("")}
  ${reveal.ripples.map((p) => `<path d="${p}" stroke="#00cccc"/>`).join("")}
  <path d="${reveal.star5}" stroke="#ff8800"/>
  <path d="${reveal.sparkleRight}" stroke="#ff8800"/>
  <path d="${reveal.sparkleCenter}" stroke="#ff8800"/>
  <path d="${reveal.flame}" stroke="#00ff00" stroke-width="1.5"/>
</g>
${reveal.dots.map((d) => `<circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="none" stroke="red"/>`).join("")}
</svg>`;
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(PREVIEW_DIR, "solenne-intro-preview.svg"), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(PREVIEW_DIR, "solenne-intro-preview.png"));
  console.log("preview written to", path.relative(ROOT, PREVIEW_DIR));
}
