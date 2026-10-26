import { z } from "zod";

// ---------------------------------------------------------------------------
// Solenne admin assistant — tool input schemas.
//
// Every value that reaches a tool comes from the MODEL, so it is untrusted in
// exactly the same way a request body is. Each schema below is the only door
// between the model's JSON and a database query:
//
//   * statuses are a closed enum (never a free string),
//   * limits are integers inside the tool's documented row cap,
//   * search terms are bounded and stripped of the characters that carry
//     meaning in a PostgREST composite filter (`,`, `(`, `)`, `"`, `'`, `\`,
//     `*`, `:`) before they are handed to the existing admin search helpers,
//     which escape LIKE wildcards themselves.
//
// `%` and `_` are deliberately allowed here: they are ordinary text in a
// customer name ("50%"), and `escapeLikePattern()` (lib/search-utils.ts) makes
// them match literally once the query is built. They never reach SQL raw.
//
// This module is intentionally dependency-free apart from zod so the static
// verification harness can import it directly with Node's type stripping.
// ---------------------------------------------------------------------------

export const ORDER_STATUS_VALUES = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type AssistantOrderStatus = (typeof ORDER_STATUS_VALUES)[number];

export const ORDER_RANGE_VALUES = ["today", "7d", "30d"] as const;

export type AssistantOrderRange = (typeof ORDER_RANGE_VALUES)[number];

/** Row caps, exported so the harness and the tools cannot drift apart. */
export const ORDER_LIST_MAX_LIMIT = 10;
export const ORDER_LIST_DEFAULT_LIMIT = 5;
export const LOW_STOCK_MAX_LIMIT = 15;
export const LOW_STOCK_DEFAULT_LIMIT = 10;
export const ORDER_DETAIL_MAX_ITEMS = 10;
export const SEARCH_MAX_LENGTH = 80;
export const ORDER_NUMBER_MAX_LENGTH = 40;

/**
 * Characters that can break (or inject into) a PostgREST `.or()` clause and
 * have no business in an order number, customer name, email or product slug.
 * The existing admin search helpers strip the same set; rejecting them here
 * fails loudly at the tool boundary instead of silently rewriting the query.
 */
const FORBIDDEN_SEARCH_CHARACTERS = /[(),"'\\:*]/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export const orderStatusSchema = z.enum(ORDER_STATUS_VALUES);

export const orderRangeSchema = z.enum(ORDER_RANGE_VALUES);

/**
 * Bounded, PostgREST-safe search text. `%` and `_` remain allowed and are
 * escaped by the downstream helper.
 */
export const searchQuerySchema = z
  .string()
  .trim()
  .min(1)
  .max(SEARCH_MAX_LENGTH)
  .refine((value) => !FORBIDDEN_SEARCH_CHARACTERS.test(value), {
    message: "Search text contains unsupported filter characters.",
  })
  .refine((value) => !CONTROL_CHARACTERS.test(value), {
    message: "Search text contains control characters.",
  });

/** Public order numbers are generated as `SLN-<base36>-<random>`. */
export const orderNumberSchema = z
  .string()
  .trim()
  .min(3)
  .max(ORDER_NUMBER_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, {
    message: "Order number must contain letters, digits and hyphens only.",
  });

export const getOrderSummaryInputSchema = z
  .object({
    range: orderRangeSchema.default("today"),
  })
  .strict();

export const listOrdersInputSchema = z
  .object({
    status: orderStatusSchema.optional(),
    olderThanDays: z.number().int().min(1).max(365).optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(ORDER_LIST_MAX_LIMIT)
      .default(ORDER_LIST_DEFAULT_LIMIT),
  })
  .strict();

export const findOrderInputSchema = z
  .object({
    query: searchQuerySchema,
  })
  .strict();

export const getOrderDetailInputSchema = z
  .object({
    orderNumber: orderNumberSchema,
  })
  .strict();

export const listLowStockInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(LOW_STOCK_MAX_LIMIT)
      .default(LOW_STOCK_DEFAULT_LIMIT),
  })
  .strict();

export const getProductStockInputSchema = z
  .object({
    nameOrSlug: searchQuerySchema,
  })
  .strict();

export const findCustomerInputSchema = z
  .object({
    query: searchQuerySchema,
  })
  .strict();

export const getDashboardMetricsInputSchema = z.object({}).strict();

// ---------------------------------------------------------------------------
// Phase 2 — drafting. Still a strict, bounded object: the model supplies text
// only. There is no recipient, no send flag and no customer id, so the tool has
// nothing to act on. `to`/`send`/`cc` are rejected outright.
// ---------------------------------------------------------------------------

export const DRAFT_LANGUAGE_VALUES = ["vi", "en"] as const;

export type AssistantDraftLanguage = (typeof DRAFT_LANGUAGE_VALUES)[number];

export const DRAFT_SUBJECT_MAX_LENGTH = 140;
export const DRAFT_BODY_MAX_LENGTH = 2000;

/** Control characters except tab and newline: never valid in an email draft. */
const DRAFT_CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const draftCustomerEmailInputSchema = z
  .object({
    language: z.enum(DRAFT_LANGUAGE_VALUES),
    subject: z
      .string()
      .trim()
      .min(1)
      .max(DRAFT_SUBJECT_MAX_LENGTH)
      .refine((value) => !DRAFT_CONTROL_CHARACTERS.test(value), {
        message: "Subject contains control characters.",
      }),
    body: z
      .string()
      .trim()
      .min(1)
      .max(DRAFT_BODY_MAX_LENGTH)
      .refine((value) => !DRAFT_CONTROL_CHARACTERS.test(value), {
        message: "Body contains control characters.",
      }),
  })
  .strict();

// ---------------------------------------------------------------------------
// Phase 3 — action proposals. These schemas describe WHAT the operator wants to
// change, never a command to execute it. The proposal tools only read current
// state and return a card; confirmation goes through the existing admin server
// action, which runs its own zod schema, permission check and atomic RPC.
// ---------------------------------------------------------------------------

export const FULFILLMENT_TARGET_VALUES = [
  "processing",
  "shipped",
  "delivered",
] as const;

export type AssistantFulfillmentTarget =
  (typeof FULFILLMENT_TARGET_VALUES)[number];

/** Only the three targets `update_order_status` (0007) accepts. */
export const fulfillmentTargetSchema = z.enum(FULFILLMENT_TARGET_VALUES);

export const CANCEL_REASON_MAX_LENGTH = 500;
export const ADJUST_REASON_MIN_LENGTH = 3;
export const ADJUST_REASON_MAX_LENGTH = 255;

export const proposeCancelOrderInputSchema = z
  .object({
    orderNumber: orderNumberSchema,
    // 0006 treats the reason as optional. An empty string means "no reason".
    reason: z
      .string()
      .trim()
      .max(CANCEL_REASON_MAX_LENGTH)
      .refine((value) => value.length === 0 || value.length >= 3, {
        message: "A cancellation reason must be at least 3 characters.",
      })
      .optional(),
  })
  .strict();

export const proposeFulfillmentTransitionInputSchema = z
  .object({
    orderNumber: orderNumberSchema,
    toStatus: fulfillmentTargetSchema,
  })
  .strict();

export const proposeInventoryAdjustmentInputSchema = z
  .object({
    variantRef: searchQuerySchema,
    delta: z
      .number()
      .int("Delta must be an integer.")
      .refine((value) => value !== 0, "Adjustment delta cannot be zero."),
    reason: z
      .string()
      .trim()
      .min(ADJUST_REASON_MIN_LENGTH)
      .max(ADJUST_REASON_MAX_LENGTH),
  })
  .strict();

/**
 * Inclusive lower bound for a summary window. "today" is the UTC start of the
 * current day (the same convention the audit viewer uses); the rolling windows
 * are exact 7/30-day offsets from `now`.
 */
export function resolveRangeStart(
  range: AssistantOrderRange,
  now: Date = new Date()
): string {
  if (range === "today") {
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).toISOString();
  }

  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Human window label used in tool results and the prompt. */
export function rangeLabel(
  range: AssistantOrderRange,
  locale: "en" | "vi"
): string {
  if (locale === "vi") {
    if (range === "today") return "hôm nay";
    return range === "7d" ? "7 ngày qua" : "30 ngày qua";
  }
  if (range === "today") return "today";
  return range === "7d" ? "the last 7 days" : "the last 30 days";
}
