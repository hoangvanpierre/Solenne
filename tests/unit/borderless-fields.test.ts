import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

// Static presentation contracts, not browser or live-form integration tests.
const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const css = read("app/globals.css");
const input = read("components/ui/input.tsx");
const combobox = read("components/ui/combobox.tsx");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing CSS rule: ${selector}`);
  return css.slice(start, css.indexOf("}", start) + 1);
}

test("field surfaces are opt-in and borderless without a resting shadow", () => {
  const base = rule(".solenne-field");
  assert.match(base, /border: 0;/);
  assert.match(base, /background-color: var\(--field-surface\)/);
  assert.match(base, /--field-indicator: 0 0 #0000/);
  assert.match(base, /--field-autofill: 0 0 #0000/);
  assert.match(base, /transition: background-color/);
  assert.equal(css.includes("--admin-field-border"), false);
});

test("keyboard field focus uses a warm taupe underline rather than an amber rectangle", () => {
  const focus = rule(".admin-scope .solenne-field:focus-visible");
  assert.match(focus, /inset 0 -2px 0 var\(--field-focus-indicator\)/);
  assert.match(focus, /outline: none/);
  assert.match(focus, /border-radius: var\(--field-radius\)/);
  assert.match(css, /--field-focus-indicator: color-mix\(in oklab, var\(--muted-foreground\) 70%, var\(--color-amber\)\)/);
});

test("non-field controls retain the existing global focus outline", () => {
  assert.match(rule("*:focus-visible"), /outline: 2px solid var\(--ring\)/);
});

test("forced-colors mode restores a system keyboard focus outline", () => {
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.admin-scope \.solenne-field:focus-visible/);
  assert.match(forced, /outline: 2px solid Highlight/);
  assert.match(forced, /border-bottom: 1px solid CanvasText/);
});

test("invalid fields have a restrained indicator and existing inline error associations", () => {
  assert.match(rule('.solenne-field[data-invalid="true"]'), /inset 0 -1px 0 var\(--field-error-indicator\)/);
  assert.match(input, /aria-invalid=\{error \? true : props\["aria-invalid"\]\}/);
  assert.match(input, /props\["aria-describedby"\]/);
  assert.match(input, /error \? errorId : undefined/);
  assert.match(input, /<p id=\{errorId\}/);
  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /aria-controls=\{isOpen \? `\$\{inputId\}-listbox` : undefined\}/);
  assert.match(combobox, /aria-invalid=\{error \? true : undefined\}/);
  assert.match(combobox, /aria-describedby=\{error \? `\$\{inputId\}-error` : undefined\}/);
});

test("disabled and read-only fields keep their states without changing semantics", () => {
  assert.match(rule(".admin-scope .solenne-field:disabled"), /cursor: not-allowed/);
  assert.match(rule(".admin-scope .solenne-field:disabled"), /opacity: var\(--field-disabled-opacity\)/);
  assert.match(rule(".admin-scope .solenne-field[readonly]"), /var\(--field-readonly\)/);
  assert.match(css, /--field-disabled-opacity: 0\.5/);
  assert.match(css, /\.solenne-field:where\(:not\(:disabled\):not\(\[readonly\]\)\):hover/);
  assert.match(read("components/admin/inventory-adjust-control.tsx"), /aria-invalid=\{!!error && !isReasonValid\}/);
  assert.match(input, /\.\.\.props/);
  assert.match(combobox, /disabled=\{disabled \|\| loading\}/);
});

test("autofill retains readable text and the active field surface", () => {
  const autofill = rule(".solenne-field:is(:autofill, :-webkit-autofill)");
  assert.match(autofill, /inset 0 0 0 1000px var\(--field-surface\)/);
  assert.match(autofill, /-webkit-text-fill-color: currentColor/);
  assert.match(autofill, /caret-color: currentColor/);
});

test("native dropdowns and inverse newsletter fields support dark surfaces", () => {
  assert.match(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*\.solenne-field\s*\{\s*color-scheme: dark/);
  assert.match(rule(".solenne-field-inverse"), /color-scheme: dark/);
  assert.match(read("components/sections/newsletter.tsx"), /solenne-field-inverse/);
});

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex.slice(1).match(/../g)!.map((channel) => parseInt(channel, 16) / 255);
    const linear = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    );
    return linear.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  };
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function hexToken(selector: string, token: string): string {
  const match = rule(selector).match(new RegExp(`${token}: (#[0-9a-f]{6});`, "i"));
  assert.ok(match, `Missing literal color token: ${token}`);
  return match[1];
}

test("placeholder colors retain AA contrast against the darkest light and inverse field surfaces", () => {
  const placeholder = hexToken(":root", "--field-placeholder");
  const inverse = hexToken(".solenne-field-inverse", "--field-placeholder");
  // Conservative sRGB samples of the existing focused surfaces; browser audits
  // measure the live color-mix results separately for every interactive state.
  assert.ok(contrastRatio(placeholder, "#d9d4cc") >= 4.5);
  assert.ok(contrastRatio(inverse, hexToken(".solenne-field-inverse", "--field-focus")) >= 4.5);
  assert.match(rule(".solenne-field::placeholder"), /color: var\(--field-placeholder\)/);
  assert.match(rule(".solenne-field::placeholder"), /opacity: 1/);
  assert.doesNotMatch(read("components/sections/newsletter.tsx"), /placeholder:text-cream\/40/);
});

test("inline error contrast improves without changing the destructive palette", () => {
  const error = hexToken(":root", "--field-error-text");
  assert.ok(contrastRatio(error, hexToken(":root", "--background")) >= 4.5);
  assert.equal(hexToken(":root", "--destructive").toLowerCase(), "#c44a4a");
  assert.match(rule('p.text-destructive[id$="-error"]'), /color: var\(--field-error-text\)/);
});

test("read-only fields have a distinct surface and readable tone without disabled opacity", () => {
  const readonly = rule(".admin-scope .solenne-field[readonly]");
  assert.match(readonly, /--field-surface: var\(--field-readonly\)/);
  assert.match(readonly, /color: var\(--field-readonly-text\)/);
  assert.match(readonly, /cursor: default/);
  assert.doesNotMatch(readonly, /opacity:/);
  assert.match(rule(".admin-scope .solenne-field:disabled"), /opacity: var\(--field-disabled-opacity\)/);
});

test("hybrid surfaces blend into the page rather than darkening with foreground", () => {
  const tokens = rule(":root");
  assert.match(tokens, /--field-background: color-mix\(in oklab, var\(--muted\) 28%, var\(--background\)\)/);
  assert.match(tokens, /--field-hover: color-mix\(in oklab, var\(--muted\) 45%, var\(--background\)\)/);
  assert.match(tokens, /--field-focus: color-mix\(in oklab, var\(--muted\) 60%, var\(--background\)\)/);
  assert.match(rule(".solenne-field"), /border-radius: var\(--field-radius\)/);
  assert.match(tokens, /--field-radius: var\(--radius-sm\)/);
  assert.match(input, /h-\(--field-height\)/);
  assert.match(combobox, /h-\(--field-height\)/);
  assert.doesNotMatch(read("components/sections/newsletter.tsx"), /solenne-field-inverse[^"\n]*rounded-full/);
});

test("pointer focus has a fine underline and keyboard focus strengthens it", () => {
  assert.match(rule(".admin-scope .solenne-field:focus"), /inset 0 -1px 0 var\(--field-focus-indicator\)/);
  assert.match(rule(".admin-scope .solenne-field:focus-visible"), /inset 0 -2px 0 var\(--field-focus-indicator\)/);
});

test("validation preserves the same soft surfaces as other fields, including textareas", () => {
  assert.match(rule('.solenne-field[data-invalid="true"]'), /--field-surface: var\(--field-background\)/);
  assert.match(rule('.solenne-field:is([aria-invalid="true"], [data-invalid="true"]):focus'), /--field-surface: var\(--field-focus\)/);
  const contact = read("components/sections/contact-form.tsx");
  assert.match(contact, /rows=\{6\}/);
  assert.match(contact, /solenne-field flex w-full px-\(--field-padding-inline\)/);
  assert.doesNotMatch(contact, /resize-none/);
});

test("custom dropdown placeholders and report errors share the field palette", () => {
  assert.match(combobox, /!selectedOption && "solenne-field-placeholder"/);
  assert.match(rule(".solenne-field-placeholder"), /color: var\(--field-placeholder\)/);
  assert.match(rule('p.text-destructive[id^="report-error-"]'), /color: var\(--field-error-text\)/);
  assert.match(combobox, /isSelected && "font-medium text-foreground bg-amber\/5"/);
  assert.match(combobox, /bg-background shadow-sm overflow-hidden/);
  assert.match(css, /:not\(\[data-focus-plain\]\):not\(\.solenne-field\):focus-visible/);
});

function sourcePaths(directory: string): string[] {
  return readdirSync(new URL(`${directory}/`, root), { withFileTypes: true })
    .flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? sourcePaths(path) : path.endsWith(".tsx") ? [path] : [];
    });
}

interface Field {
  path: string;
  tag: string;
  attributes: ts.JsxAttributes;
}

const fields: Field[] = [];
for (const path of [...sourcePaths("app"), ...sourcePaths("components")]) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (["input", "select", "textarea", "button", "a"].includes(tag)) {
        fields.push({ path, tag, attributes: node.attributes });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function attribute(field: Field, name: string): ts.JsxAttribute | undefined {
  return field.attributes.properties.find(
    (prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText() === name
  );
}

const nonTextTypes = new Set(["hidden", "checkbox", "radio", "range", "file", "color", "submit", "reset", "button", "image"]);
const textFields = fields.filter((field) => {
  if (!["input", "select", "textarea"].includes(field.tag)) return false;
  const type = attribute(field, "type")?.initializer;
  return !type || !ts.isStringLiteral(type) || !nonTextTypes.has(type.text);
});

test("every native text field, textarea and select opts into the shared presentation", () => {
  assert.ok(textFields.length > 30, "The audit must cover storefront and admin fields");
  for (const field of textFields) {
    assert.match(attribute(field, "className")?.getText() ?? "", /solenne-field/, `${field.path}: <${field.tag}>`);
  }
});

test("native text fields do not reintroduce boxed borders or focus rings", () => {
  for (const field of textFields) {
    const classes = attribute(field, "className")?.getText() ?? "";
    assert.doesNotMatch(classes, /\b(?:border-border|border-destructive|ring-2|focus(?:-visible)?:(?:ring|border))/, field.path);
  }
});

test("ordinary buttons and links do not opt into field styling", () => {
  for (const field of fields.filter((field) => ["button", "a"].includes(field.tag))) {
    const classes = attribute(field, "className")?.getText() ?? "";
    if (classes.includes("solenne-field")) {
      assert.equal(field.path, "components/ui/combobox.tsx");
      assert.ok(attribute(field, "aria-haspopup"), "Only the dropdown trigger is a field");
    }
  }
});
