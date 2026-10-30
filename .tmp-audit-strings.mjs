import fs from "node:fs";
import path from "node:path";

const roots = ["app", "components", "lib"];
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(p);
  }
})(".");

const ATTRS = /\b(?:placeholder|aria-label|aria-description|title|alt|label|description|heading|subtitle|caption|summary|emptyText|emptyTitle|emptyDescription|confirmLabel|cancelLabel|submitLabel|successMessage|errorMessage)\s*=\s*"([^"]{3,})"/g;

const results = [];
for (const file of files) {
  if (file.startsWith("node_modules")) continue;
  const src = fs.readFileSync(file, "utf8");
  if (file.includes("components\\ui\\") || file.includes("components/ui/")) continue;
  const found = new Set();

  // JSX text nodes
  for (const m of src.matchAll(/>([^<>{}\n]{3,}?)</g)) {
    const text = m[1].trim();
    if (!/[A-Za-zÀ-ỹ]/.test(text)) continue;
    if (/^[\s·|/,.:;–—-]*$/.test(text)) continue;
    if (/^[a-z-]+$/.test(text)) continue;
    found.add(`text: ${text}`);
  }
  // string attributes
  for (const m of src.matchAll(ATTRS)) {
    found.add(`attr: ${m[0].slice(0, 140)}`);
  }
  // metadata-ish string literals
  for (const m of src.matchAll(/\b(?:description|title|label|message|text|heading|subtitle)\s*:\s*"([^"]{6,})"/g)) {
    found.add(`obj: ${m[0].slice(0, 160)}`);
  }

  if (found.size) results.push({ file: file.replace(/\\/g, "/"), found: [...found] });
}

for (const r of results) {
  console.log(`\n### ${r.file}`);
  for (const f of r.found) console.log(`  ${f}`);
}
console.log(`\nTotal files with candidates: ${results.length}`);
