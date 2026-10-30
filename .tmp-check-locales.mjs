import fs from "node:fs";

const en = JSON.parse(fs.readFileSync("messages/en.json", "utf8"));
const vi = JSON.parse(fs.readFileSync("messages/vi.json", "utf8"));

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const fe = flatten(en);
const fv = flatten(vi);

const enKeys = Object.keys(fe).sort();
const viKeys = Object.keys(fv).sort();

let fail = 0;
const onlyEn = enKeys.filter((k) => !(k in fv));
const onlyVi = viKeys.filter((k) => !(k in fe));
if (onlyEn.length) { fail++; console.log("MISSING IN VI:", onlyEn.join(", ")); }
if (onlyVi.length) { fail++; console.log("MISSING IN EN:", onlyVi.join(", ")); }

// placeholder parity: {name} tokens and ICU plural markers
const tokenRe = /\{[a-zA-Z0-9_]+\}/g;
for (const k of enKeys) {
  if (!(k in fv)) continue;
  const a = [...(String(fe[k]).match(tokenRe) ?? [])].sort().join(",");
  const b = [...(String(fv[k]).match(tokenRe) ?? [])].sort().join(",");
  if (a !== b) {
    fail++;
    console.log(`PLACEHOLDER MISMATCH ${k}: en=[${a}] vi=[${b}]`);
  }
}

// ICU plural structure parity
for (const k of enKeys) {
  if (!(k in fv)) continue;
  const a = String(fe[k]);
  const b = String(fv[k]);
  const plural = (s) => /,\s*plural,/.test(s);
  if (plural(a) !== plural(b)) {
    fail++;
    console.log(`PLURAL MISMATCH ${k}`);
  }
}

// empty strings
for (const k of enKeys) {
  if (!String(fe[k]).trim()) { fail++; console.log(`EMPTY EN ${k}`); }
  if (k in fv && !String(fv[k]).trim()) { fail++; console.log(`EMPTY VI ${k}`); }
}

console.log(`\nen keys: ${enKeys.length}  vi keys: ${viKeys.length}`);
console.log(fail === 0 ? "LOCALE PARITY OK" : `${fail} problem(s)`);
process.exit(fail === 0 ? 0 : 1);
