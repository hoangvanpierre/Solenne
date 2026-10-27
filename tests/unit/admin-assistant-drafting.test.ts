import test from "node:test";
import assert from "node:assert/strict";
import {
  MAILTO_MAX_LENGTH,
  MAILTO_TRUNCATION_MARKER,
  buildDraftIntentPrompt,
  buildMailtoUrl,
  defaultReplyLanguage,
  findPlaceholders,
} from "../../lib/admin-assistant/drafting.ts";

test("findPlaceholders deduplicates and ignores multiline brackets", () => {
  assert.deepEqual(
    findPlaceholders("Hi [ETA], still [ETA]; tracking: [tracking number]"),
    ["[ETA]", "[tracking number]"]
  );
  assert.deepEqual(findPlaceholders("[not\nmatched]"), []);
  assert.deepEqual(findPlaceholders(""), []);
});

test("defaultReplyLanguage follows the shipping country, defaulting to English", () => {
  assert.equal(defaultReplyLanguage("Vietnam"), "vi");
  assert.equal(defaultReplyLanguage("VN"), "vi");
  assert.equal(defaultReplyLanguage("Việt Nam"), "vi");
  assert.equal(defaultReplyLanguage("United States"), "en");
  assert.equal(defaultReplyLanguage(null), "en");
  assert.equal(defaultReplyLanguage(""), "en");
});

test("buildDraftIntentPrompt names the order, the language and the read-before-write rule", () => {
  const prompt = buildDraftIntentPrompt("shipping_update", {
    orderNumber: "SLN-ABC-123",
    language: "vi",
    locale: "en",
  });

  assert.equal(prompt.includes("SLN-ABC-123"), true);
  assert.equal(prompt.includes("getOrderDetail"), true);
  assert.equal(prompt.includes("draftCustomerEmail"), true);
  assert.equal(prompt.includes("Vietnamese"), true);
  assert.equal(prompt.includes("[tracking number]"), true);
});

test("buildMailtoUrl encodes a short draft without truncation", () => {
  const body = "Dear Lan,\r\nYour candle ships tomorrow.";
  const result = buildMailtoUrl({ subject: "Order update", body });

  assert.equal(result.truncated, false);
  assert.equal(result.href.startsWith("mailto:?subject=Order%20update&body="), true);
  assert.equal(result.originalCharacters, body.length);
  assert.equal(result.keptCharacters, body.length);
  assert.equal(result.href.length <= MAILTO_MAX_LENGTH, true);
});

test("buildMailtoUrl truncates a long draft inside the mailto budget and reports it", () => {
  const body = "a".repeat(4000);
  const result = buildMailtoUrl({ subject: "Long reply", body });

  assert.equal(result.truncated, true);
  assert.equal(result.keptCharacters < result.originalCharacters, true);
  assert.equal(result.href.length <= MAILTO_MAX_LENGTH, true);
  assert.equal(
    decodeURIComponent(result.href).includes(MAILTO_TRUNCATION_MARKER.trim()),
    true
  );
});
