import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_COPY_MAX_NOTES_PER_LAYER,
  PRODUCT_COPY_MIN_DESCRIPTION_LENGTH,
  PRODUCT_COPY_NOTE_MAX_LENGTH,
  findCopyWarnings,
  isCopyApplyable,
  parseDescriptionOutput,
  parseScentNotesOutput,
  productCopyRequestSchema,
} from "../../lib/admin-assistant/product-copy.ts";

const validRequest = {
  task: "improve",
  target: "description",
  sourceLanguage: "en",
  targetLanguage: "en",
  mode: "update",
  productName: "Midnight Garden",
  category: "floral",
  currentText: "A quiet floral candle.",
  scentTop: ["jasmine"],
  scentHeart: ["rose"],
  scentBase: ["vanilla"],
};

test("product copy request: the canonical form parses and applies defaults", () => {
  const parsed = productCopyRequestSchema.parse(validRequest);
  assert.equal(parsed.productName, "Midnight Garden");
  assert.deepEqual(parsed.scentTop, ["jasmine"]);

  const minimal = productCopyRequestSchema.parse({
    ...validRequest,
    currentText: undefined,
    scentTop: undefined,
    scentHeart: undefined,
    scentBase: undefined,
  });
  assert.equal(minimal.currentText, "");
  assert.deepEqual(minimal.scentTop, []);
});

test("product copy request: translate needs two different languages", () => {
  assert.equal(
    productCopyRequestSchema.safeParse({
      ...validRequest,
      task: "translate",
      sourceLanguage: "en",
      targetLanguage: "en",
    }).success,
    false
  );

  assert.equal(
    productCopyRequestSchema.safeParse({
      ...validRequest,
      task: "translate",
      sourceLanguage: "en",
      targetLanguage: "vi",
    }).success,
    true
  );
});

test("product copy request: generate/improve stay in one language", () => {
  assert.equal(
    productCopyRequestSchema.safeParse({
      ...validRequest,
      sourceLanguage: "en",
      targetLanguage: "vi",
    }).success,
    false
  );
});

test("product copy request: unknown keys and oversized notes are rejected", () => {
  assert.equal(
    productCopyRequestSchema.safeParse({ ...validRequest, recipient: "x" }).success,
    false
  );

  assert.equal(
    productCopyRequestSchema.safeParse({
      ...validRequest,
      scentTop: ["x".repeat(PRODUCT_COPY_NOTE_MAX_LENGTH + 1)],
    }).success,
    false
  );

  assert.equal(
    productCopyRequestSchema.safeParse({
      ...validRequest,
      scentTop: Array.from({ length: PRODUCT_COPY_MAX_NOTES_PER_LAYER + 1 }, () => "rose"),
    }).success,
    false
  );
});

test("description output: markdown fences are tolerated and whitespace is collapsed", () => {
  const text = "A quiet floral candle poured by hand, with jasmine and rose over a soft vanilla base.";
  const result = parseDescriptionOutput("```json\n{\"text\":\"A quiet   floral candle poured by hand, with jasmine and rose over a soft vanilla base.\"}\n```");

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.text, text);
    assert.deepEqual(result.warnings, []);
  }
});

test("description output: invalid JSON, wrong shape and out-of-bounds text fail with codes", () => {
  assert.deepEqual(parseDescriptionOutput("not json"), { ok: false, code: "unparsed" });
  assert.deepEqual(parseDescriptionOutput('{"text":42}'), { ok: false, code: "shape" });
  assert.deepEqual(parseDescriptionOutput('{"text":"too short"}'), {
    ok: false,
    code: "too_short",
  });
  assert.deepEqual(
    parseDescriptionOutput(JSON.stringify({ text: "x".repeat(5000) })),
    { ok: false, code: "too_long" }
  );
  assert.equal(PRODUCT_COPY_MIN_DESCRIPTION_LENGTH > 0, true);
});

test("claim scanning blocks medical, burn-time and unverifiable claims", () => {
  assert.deepEqual(findCopyWarnings("A calm soy candle."), []);
  assert.deepEqual(findCopyWarnings("This candle cures anxiety."), [
    "medical or unverifiable claim",
  ]);
  assert.deepEqual(findCopyWarnings("It burns for 40 hours."), ["burn time"]);
  assert.deepEqual(findCopyWarnings("An award-winning blend."), [
    "unverifiable claim",
  ]);
});

test("scent notes: improve must return the identical notes", () => {
  const input = {
    task: "improve" as const,
    scentTop: ["jasmine"],
    scentHeart: ["rose"],
    scentBase: ["vanilla"],
  };

  const unchanged = parseScentNotesOutput(
    JSON.stringify({ top: ["Jasmine"], heart: ["rose"], base: ["vanilla"] }),
    input
  );
  assert.equal(unchanged.ok, true);

  const invented = parseScentNotesOutput(
    JSON.stringify({ top: ["jasmine", "peony"], heart: ["rose"], base: ["vanilla"] }),
    input
  );
  assert.deepEqual(invented, { ok: false, code: "layer_mismatch" });

  const renamed = parseScentNotesOutput(
    JSON.stringify({ top: ["gardenia"], heart: ["rose"], base: ["vanilla"] }),
    input
  );
  assert.deepEqual(renamed, { ok: false, code: "unknown_notes" });
});

test("scent notes: translate keeps the count but may change the words", () => {
  const translated = parseScentNotesOutput(
    JSON.stringify({ top: ["nhài"], heart: ["hồng"], base: ["vani"] }),
    {
      task: "translate",
      scentTop: ["jasmine"],
      scentHeart: ["rose"],
      scentBase: ["vanilla"],
    }
  );

  assert.equal(translated.ok, true);
  if (translated.ok) {
    assert.deepEqual(translated.notes, {
      top: ["nhài"],
      heart: ["hồng"],
      base: ["vani"],
    });
  }
});

test("scent notes: a dropped or overlong note is rejected", () => {
  const dropped = parseScentNotesOutput(
    JSON.stringify({ top: [], heart: ["rose"], base: ["vanilla"] }),
    {
      task: "translate",
      scentTop: ["jasmine"],
      scentHeart: ["rose"],
      scentBase: ["vanilla"],
    }
  );
  assert.deepEqual(dropped, { ok: false, code: "layer_mismatch" });

  const overlong = parseScentNotesOutput(
    JSON.stringify({
      top: ["x".repeat(PRODUCT_COPY_NOTE_MAX_LENGTH + 1)],
      heart: ["rose"],
      base: ["vanilla"],
    }),
    {
      task: "translate",
      scentTop: ["jasmine"],
      scentHeart: ["rose"],
      scentBase: ["vanilla"],
    }
  );
  assert.deepEqual(overlong, { ok: false, code: "too_long" });
});

test("apply is limited to warning-free English copy", () => {
  assert.equal(isCopyApplyable("en", []), true);
  assert.equal(isCopyApplyable("en", ["burn time"]), false);
  assert.equal(isCopyApplyable("vi", []), false);
});
