import { z } from "zod";

// ---------------------------------------------------------------------------
// Solenne admin assistant — Phase 2 product-copy drafting.
//
// TEXT ONLY. This module builds a prompt, parses the model's JSON reply and
// validates it against the product form. It never touches the database: the
// server action (app/actions/product-copy.ts) owns the permission check and the
// model call, and "Apply" in the form only fills a field — the product is saved
// by the form's own Save button, exactly as before.
//
// Guard rails encoded here:
//   * the model may only restate facts the form already holds (scent notes) or
//     the house's real materials (soy wax, cotton wick, phthalate-free oils);
//   * scent-note output must keep one note per input note — no invented notes;
//   * medical / therapeutic / air-purifying / pet-safety claims and burn-time
//     figures are flagged and block Apply;
//   * `applyable` is true only for ENGLISH output, because `products` has no
//     Vietnamese columns (see the migration proposal in the Phase 2 report).
//
// Dependency-free apart from zod so scripts/verify-admin-assistant.mjs can
// import it directly.
// ---------------------------------------------------------------------------

export const PRODUCT_COPY_TASKS = ["generate", "improve", "translate"] as const;
export type ProductCopyTask = (typeof PRODUCT_COPY_TASKS)[number];

export const PRODUCT_COPY_TARGETS = ["description", "scentNotes"] as const;
export type ProductCopyTarget = (typeof PRODUCT_COPY_TARGETS)[number];

export const PRODUCT_COPY_LANGUAGES = ["en", "vi"] as const;
export type ProductCopyLanguage = (typeof PRODUCT_COPY_LANGUAGES)[number];

export const PRODUCT_COPY_SCENT_CATEGORIES = [
  "floral",
  "woody",
  "fresh",
  "warm",
] as const;

/** Matches lib/validations/product.ts — one note is a short phrase, not prose. */
export const PRODUCT_COPY_NOTE_MAX_LENGTH = 40;
export const PRODUCT_COPY_MAX_NOTES_PER_LAYER = 8;

/** Description bounds. The DB column is free text; this only rejects junk. */
export const PRODUCT_COPY_MIN_DESCRIPTION_LENGTH = 40;
export const PRODUCT_COPY_MAX_DESCRIPTION_LENGTH = 1200;

export const PRODUCT_COPY_MAX_CURRENT_TEXT_LENGTH = 2000;
export const PRODUCT_COPY_MAX_PRODUCT_NAME_LENGTH = 120;

const noteSchema = z
  .string()
  .trim()
  .min(1)
  .max(PRODUCT_COPY_NOTE_MAX_LENGTH);

const noteListSchema = z
  .array(noteSchema)
  .max(PRODUCT_COPY_MAX_NOTES_PER_LAYER);

/**
 * The one door between the client form and the model. Strict: an unknown key is
 * rejected, and the language pair is constrained so "translate" cannot silently
 * become a same-language rewrite.
 */
export const productCopyRequestSchema = z
  .object({
    task: z.enum(PRODUCT_COPY_TASKS),
    target: z.enum(PRODUCT_COPY_TARGETS),
    sourceLanguage: z.enum(PRODUCT_COPY_LANGUAGES),
    targetLanguage: z.enum(PRODUCT_COPY_LANGUAGES),
    mode: z.enum(["create", "update"]),
    productName: z
      .string()
      .trim()
      .min(1)
      .max(PRODUCT_COPY_MAX_PRODUCT_NAME_LENGTH),
    category: z.enum(PRODUCT_COPY_SCENT_CATEGORIES),
    currentText: z
      .string()
      .max(PRODUCT_COPY_MAX_CURRENT_TEXT_LENGTH)
      .default(""),
    scentTop: noteListSchema.default([]),
    scentHeart: noteListSchema.default([]),
    scentBase: noteListSchema.default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.task === "translate") {
      if (value.sourceLanguage === value.targetLanguage) {
        ctx.addIssue({
          code: "custom",
          path: ["targetLanguage"],
          message: "Translate needs two different languages.",
        });
      }
      return;
    }

    if (value.sourceLanguage !== value.targetLanguage) {
      ctx.addIssue({
        code: "custom",
        path: ["targetLanguage"],
        message: "Generate and improve stay in one language.",
      });
    }
  });

export type ProductCopyRequest = z.infer<typeof productCopyRequestSchema>;

export interface ProductCopyNotes {
  top: string[];
  heart: string[];
  base: string[];
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * House facts the model may rely on, taken from /about and /care-guide. Anything
 * outside this list (burn hours, sizes, certifications) must not appear.
 */
export const PRODUCT_COPY_SYSTEM_PROMPT = [
  "You write product copy for Solenne, a small candle studio.",
  "Facts you may use: 100% natural soy wax, cotton wicks, phthalate-free fragrance oils, small-batch hand pouring.",
  "Voice: gentle, refined, sensory and concrete. No exclamation marks, no emoji, no hype such as \"luxury\", \"best\" or \"amazing\".",
  "Never invent ingredients, waxes, wick materials, burn times, sizes, weights, certifications, awards, reviews, prices, stock or delivery promises.",
  "Never make medical, therapeutic, air-purifying, insect-repelling or pet-safety claims.",
  "Never mention discounts, sales or delivery dates.",
  "Return ONLY one JSON object. No markdown fence, no commentary before or after it.",
].join("\n");

function notesLine(label: string, notes: string[]): string {
  return `${label}: ${notes.length > 0 ? notes.join(", ") : "none"}`;
}

function notesBlock(input: ProductCopyRequest): string {
  return [
    notesLine("Top", input.scentTop),
    notesLine("Heart", input.scentHeart),
    notesLine("Base", input.scentBase),
  ].join("\n");
}

/**
 * Build the system + user prompt for one copy request. Pure and deterministic,
 * so the static harness can assert the guard rails are actually stated.
 */
export function buildProductCopyPrompt(input: ProductCopyRequest): {
  system: string;
  prompt: string;
} {
  const languageName = input.targetLanguage === "vi" ? "Vietnamese" : "English";
  const current = input.currentText.trim();

  const header = [
    `Product name: ${input.productName}`,
    `Scent family: ${input.category}`,
    "Scent notes currently in the form (the only notes you may mention):",
    notesBlock(input),
  ].join("\n");

  if (input.target === "description") {
    const instruction =
      input.task === "generate"
        ? `Write one product description of 50-90 words in ${languageName}, as a single paragraph with no heading. Use only the scent notes listed above. Sensory and specific, never exaggerated.`
        : input.task === "improve"
          ? `Rewrite the description below in ${languageName}. Keep every fact it states, remove hype and repetition, and stay between 50 and 90 words. Do not add notes, ingredients or claims that are not already there.`
          : `Translate the description below into ${languageName}. Keep the meaning, the facts and roughly the same length. Do not add or remove any claim.`;

    const body = input.task === "generate" ? "" : `\n\nDescription:\n"""\n${current}\n"""`;

    return {
      system: PRODUCT_COPY_SYSTEM_PROMPT,
      prompt: `${header}\n\n${instruction}${body}\n\nReturn JSON exactly as {"text":"<the description>"}.`,
    };
  }

  const instruction =
    input.task === "improve"
      ? `Clean up the note names below: consistent capitalisation and spelling only. Keep the SAME number of notes in each layer, in the SAME order. Never add, remove, merge or replace a note.`
      : `Translate each note name into ${languageName}, one note per array item, keeping the same order and the same number of notes per layer. If a note has no established translation, keep the original spelling.`;

  return {
    system: PRODUCT_COPY_SYSTEM_PROMPT,
    prompt: `${header}\n\n${instruction}\n\nReturn JSON exactly as {"top":["..."],"heart":["..."],"base":["..."]} and keep every array empty if that layer is empty.`,
  };
}

// ---------------------------------------------------------------------------
// Claim detection
// ---------------------------------------------------------------------------

/**
 * Phrases that must never ship in product copy. Each hit blocks Apply and is
 * shown to the operator, so a model that drifts is visible instead of silent.
 */
const CLAIM_PATTERNS: { pattern: RegExp; label: string }[] = [
  {
    pattern:
      /\b(cures?|cured|treats?|heals?|therapeutic|medicinal|antibacterial|antimicrobial|detox\w*|air[- ]purif\w*|purif(?:y|ies) the air|insect repell\w*|pet[- ]safe|safe for (?:cats|dogs|pets|children))\b/i,
    label: "medical or unverifiable claim",
  },
  {
    pattern:
      /\b(chữa bệnh|trị bệnh|điều trị|thanh lọc|khử khuẩn|diệt khuẩn|lọc không khí|an toàn cho (?:mèo|chó|thú cưng|trẻ em))\b/i,
    label: "medical or unverifiable claim",
  },
  {
    pattern: /\b\d+\s*(?:hours?|hrs?|giờ)\b/i,
    label: "burn time",
  },
  {
    pattern:
      /\b(award[- ]winning|clinically proven|dermatologist[- ]tested|lab[- ]tested|guaranteed)\b/i,
    label: "unverifiable claim",
  },
];

export function findCopyWarnings(text: string): string[] {
  if (typeof text !== "string" || text.length === 0) return [];

  const labels = new Set<string>();
  for (const { pattern, label } of CLAIM_PATTERNS) {
    if (pattern.test(text)) labels.add(label);
  }

  return [...labels];
}

// ---------------------------------------------------------------------------
// Output parsing
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function extractJsonObject(raw: string): Rec | null {
  if (typeof raw !== "string") return null;

  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  try {
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Rec)
      : null;
  } catch {
    return null;
  }
}

export type ProductCopyFailureCode =
  | "unparsed"
  | "shape"
  | "too_short"
  | "too_long"
  | "layer_mismatch"
  | "unknown_notes";

export type DescriptionParseResult =
  | { ok: true; text: string; warnings: string[] }
  | { ok: false; code: ProductCopyFailureCode };

export function parseDescriptionOutput(raw: string): DescriptionParseResult {
  const parsed = extractJsonObject(raw);
  if (!parsed) return { ok: false, code: "unparsed" };

  const value = parsed.text;
  if (typeof value !== "string") return { ok: false, code: "shape" };

  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < PRODUCT_COPY_MIN_DESCRIPTION_LENGTH) {
    return { ok: false, code: "too_short" };
  }
  if (text.length > PRODUCT_COPY_MAX_DESCRIPTION_LENGTH) {
    return { ok: false, code: "too_long" };
  }

  return { ok: true, text, warnings: findCopyWarnings(text) };
}

export type NotesParseResult =
  | { ok: true; notes: ProductCopyNotes; warnings: string[] }
  | { ok: false; code: ProductCopyFailureCode };

function normalizeNote(note: string): string {
  return note.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Validate a scent-note reply against the notes the form holds.
 *
 * "improve" must return exactly the same notes (case/whitespace aside) in each
 * layer, so a model cannot quietly introduce a new ingredient. "translate" may
 * change the words but not the count or the order.
 */
export function parseScentNotesOutput(
  raw: string,
  input: Pick<ProductCopyRequest, "task" | "scentTop" | "scentHeart" | "scentBase">
): NotesParseResult {
  const parsed = extractJsonObject(raw);
  if (!parsed) return { ok: false, code: "unparsed" };

  const source: ProductCopyNotes = {
    top: input.scentTop,
    heart: input.scentHeart,
    base: input.scentBase,
  };

  const notes: ProductCopyNotes = { top: [], heart: [], base: [] };
  const layers: (keyof ProductCopyNotes)[] = ["top", "heart", "base"];

  for (const layer of layers) {
    const value = parsed[layer];
    if (!Array.isArray(value)) return { ok: false, code: "shape" };

    const cleaned = value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.replace(/\s+/g, " ").trim())
      .filter((entry) => entry.length > 0);

    if (cleaned.some((entry) => entry.length > PRODUCT_COPY_NOTE_MAX_LENGTH)) {
      return { ok: false, code: "too_long" };
    }

    if (cleaned.length !== source[layer].length) {
      return { ok: false, code: "layer_mismatch" };
    }

    notes[layer] = cleaned;
  }

  if (input.task === "improve") {
    for (const layer of layers) {
      const before = source[layer].map(normalizeNote).sort().join("|");
      const after = notes[layer].map(normalizeNote).sort().join("|");
      if (before !== after) return { ok: false, code: "unknown_notes" };
    }
  }

  const warnings = findCopyWarnings(
    [...notes.top, ...notes.heart, ...notes.base].join(", ")
  );

  return { ok: true, notes, warnings };
}

/**
 * Only English copy can be written back into `products`, because the table has
 * no Vietnamese columns. Everything else is copy-to-clipboard.
 */
export function isCopyApplyable(
  targetLanguage: ProductCopyLanguage,
  warnings: string[]
): boolean {
  return targetLanguage === "en" && warnings.length === 0;
}
