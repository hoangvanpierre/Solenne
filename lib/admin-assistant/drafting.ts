// ---------------------------------------------------------------------------
// Solenne admin assistant — Phase 2 drafting helpers.
//
// Everything here is TEXT ONLY. Nothing in this module sends, schedules or
// stores an email, and nothing reads the database. The assistant returns a
// draft; the operator decides what to do with it.
//
// Three jobs:
//   1. The five reply intents the order page offers, with a prompt per intent.
//   2. Placeholder discipline: when a fact is unknown (tracking code, ETA,
//      refund amount) the draft must show a visible [placeholder] instead of a
//      plausible-looking invention. `findPlaceholders()` is what the drawer
//      uses to warn the operator.
//   3. `buildMailtoUrl()`: a mailto: link with encoded subject/body that stays
//      under the length limit mail clients accept, truncating the body with a
//      visible marker rather than producing a link that silently does nothing.
//
// Dependency-free (no React, no `@/` imports) so scripts/verify-admin-assistant
// .mjs can import it directly with Node's type stripping.
// ---------------------------------------------------------------------------

export const DRAFT_LANGUAGES = ["en", "vi"] as const;

export type DraftLanguage = (typeof DRAFT_LANGUAGES)[number];

export const DRAFT_INTENT_IDS = [
  "delay",
  "cancellation",
  "shipping_update",
  "payment_reminder",
  "thank_you",
] as const;

export type DraftIntentId = (typeof DRAFT_INTENT_IDS)[number];

export interface DraftIntent {
  id: DraftIntentId;
  label: { en: string; vi: string };
  /** What the model should do for this intent. Facts still come from tools. */
  instruction: { en: string; vi: string };
}

export const DRAFT_INTENTS: readonly DraftIntent[] = [
  {
    id: "delay",
    label: { en: "Delayed order", vi: "Đơn bị chậm" },
    instruction: {
      en: "The order is running late. Apologise briefly, state the order's current status from the tool result, and give a new estimate only if the tool returns one.",
      vi: "Đơn hàng đang bị chậm. Xin lỗi ngắn gọn, nêu trạng thái hiện tại của đơn theo kết quả công cụ, và chỉ đưa ra thời gian mới nếu công cụ có trả về.",
    },
  },
  {
    id: "cancellation",
    label: { en: "Cancellation", vi: "Hủy đơn" },
    instruction: {
      en: "The customer asked about cancelling. State plainly what the tool shows about the order status and explain the next step, without promising a cancellation or a refund the operator has not made.",
      vi: "Khách hỏi về việc hủy đơn. Nêu rõ tình trạng đơn theo kết quả công cụ và giải thích bước tiếp theo, không hứa hẹn việc hủy hay hoàn tiền mà người vận hành chưa thực hiện.",
    },
  },
  {
    id: "shipping_update",
    label: { en: "Shipping update", vi: "Cập nhật vận chuyển" },
    instruction: {
      en: "Give a calm shipping update: the current status, the tracking code if the tool returned one (otherwise [tracking number]), and the standard delivery window from the policy.",
      vi: "Gửi cập nhật vận chuyển nhẹ nhàng: trạng thái hiện tại, mã vận đơn nếu công cụ có trả về (nếu không thì [tracking number]), và khung thời gian giao hàng tiêu chuẩn theo chính sách.",
    },
  },
  {
    id: "payment_reminder",
    label: { en: "Payment reminder", vi: "Nhắc thanh toán" },
    instruction: {
      en: "Remind the customer gently that the order is awaiting payment. Never invent a payment link or a deadline: use [payment link] or [date] if one is needed.",
      vi: "Nhắc khách một cách nhẹ nhàng rằng đơn đang chờ thanh toán. Không tự tạo đường dẫn thanh toán hay hạn chót: dùng [payment link] hoặc [date] nếu cần.",
    },
  },
  {
    id: "thank_you",
    label: { en: "Thank-you note", vi: "Thư cảm ơn" },
    instruction: {
      en: "Thank the customer for their order and mention one concrete detail from the order (a product name the tool returned). Keep it warm and brief.",
      vi: "Cảm ơn khách đã đặt hàng và nhắc tới một chi tiết cụ thể trong đơn (tên sản phẩm mà công cụ trả về). Giữ ấm áp và ngắn gọn.",
    },
  },
];

export function draftIntent(id: DraftIntentId): DraftIntent {
  const intent = DRAFT_INTENTS.find((entry) => entry.id === id);
  if (!intent) throw new Error(`Unknown draft intent: ${id}`);
  return intent;
}

/**
 * Canonical placeholders. The prompt lists the same set, and the drawer warns
 * when a draft still contains one, so the operator sees exactly what is
 * missing before sending anything.
 */
export const DRAFT_PLACEHOLDERS = [
  "[tracking number]",
  "[ETA]",
  "[refund amount]",
  "[date]",
  "[payment link]",
] as const;

/** `[anything]` on a single line, 1–60 characters. */
export const PLACEHOLDER_PATTERN = /\[[^[\]\n]{1,60}\]/g;

export function findPlaceholders(value: string): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  const matches = value.match(PLACEHOLDER_PATTERN) ?? [];
  return [...new Set(matches)];
}

export interface DraftIntentPromptOptions {
  orderNumber: string;
  language: DraftLanguage;
  locale: DraftLanguage;
}

/**
 * The message the drawer sends when an operator taps an intent chip. It names
 * the order, the reply language and the placeholder rule; every fact still has
 * to come from getOrderDetail.
 */
export function buildDraftIntentPrompt(
  id: DraftIntentId,
  options: DraftIntentPromptOptions
): string {
  const intent = draftIntent(id);
  const { orderNumber, language, locale } = options;
  const languageName = language === "vi" ? "Vietnamese" : "English";

  if (locale === "vi") {
    return [
      `Soạn thư trả lời khách cho đơn ${orderNumber}.`,
      intent.instruction.vi,
      `Trước tiên gọi getOrderDetail với orderNumber "${orderNumber}" và chỉ dùng dữ kiện từ kết quả đó cùng chính sách của Solenne.`,
      `Ngôn ngữ thư: ${languageName}.`,
      "Nếu thiếu dữ kiện (thời gian giao mới, mã vận đơn, số tiền hoàn), hãy chèn chỗ trống rõ ràng như [ETA], [tracking number] hoặc [refund amount] thay vì tự nghĩ ra.",
      "Sau đó gọi draftCustomerEmail để trả bản nháp cho tôi xem.",
    ].join(" ");
  }

  return [
    `Draft a customer email for order ${orderNumber}.`,
    intent.instruction.en,
    `First call getOrderDetail with orderNumber "${orderNumber}" and use only facts from that result plus Solenne's policy.`,
    `Reply language: ${languageName}.`,
    "If a fact is missing (new ETA, tracking number, refund amount), insert a visible placeholder such as [ETA], [tracking number] or [refund amount] instead of inventing it.",
    "Then call draftCustomerEmail so I can review the draft.",
  ].join(" ");
}

/**
 * The customer's likely language: Vietnamese for a Vietnamese shipping
 * country, English otherwise. Only a default — the operator can switch it.
 */
export function defaultReplyLanguage(
  country: string | null | undefined
): DraftLanguage {
  const value = (country ?? "").trim().toLowerCase();
  if (!value) return "en";
  if (
    value === "vn" ||
    value === "vietnam" ||
    value === "viet nam" ||
    value.includes("việt") ||
    value.includes("viet")
  ) {
    return "vi";
  }
  return "en";
}

/**
 * Conservative mailto: budget. Windows/macOS mail clients and browsers start
 * truncating or refusing long mailto URIs around 2,000 characters; 1,900 leaves
 * room for the client's own encoding.
 */
export const MAILTO_MAX_LENGTH = 1900;

/** Visible marker appended to a body that had to be cut. */
export const MAILTO_TRUNCATION_MARKER = "\n\n[…draft truncated to fit the mail link]";

export interface MailtoInput {
  subject: string;
  body: string;
}

export interface MailtoResult {
  href: string;
  /** True when the body was cut to stay inside MAILTO_MAX_LENGTH. */
  truncated: boolean;
  /** Characters kept from the original body (0 when everything fit). */
  keptCharacters: number;
  originalCharacters: number;
  encodedLength: number;
}

function safeEncode(value: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    // A lone surrogate makes encodeURIComponent throw; drop surrogates rather
    // than handing the operator a dead link.
    return encodeURIComponent(value.replace(/[\uD800-\uDFFF]/g, ""));
  }
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
}

/**
 * Build a mailto: URI with an encoded subject and body.
 *
 * The body is shortened until the ENCODED URI fits MAILTO_MAX_LENGTH, then the
 * truncation marker is appended. `truncated` is reported so the drawer can tell
 * the operator instead of silently losing the end of the draft.
 */
export function buildMailtoUrl(input: MailtoInput): MailtoResult {
  const subject = (input.subject ?? "").replace(/[\r\n]+/g, " ").trim();
  const body = normalizeNewlines(input.body ?? "");
  const originalCharacters = body.length;

  const prefix = `mailto:?subject=${safeEncode(subject)}&body=`;
  const encodedBody = safeEncode(body);
  const fullLength = prefix.length + encodedBody.length;

  if (fullLength <= MAILTO_MAX_LENGTH) {
    return {
      href: `${prefix}${encodedBody}`,
      truncated: false,
      keptCharacters: originalCharacters,
      originalCharacters,
      encodedLength: fullLength,
    };
  }

  const marker = normalizeNewlines(MAILTO_TRUNCATION_MARKER);
  const budget = MAILTO_MAX_LENGTH - prefix.length;

  let kept = body;
  let encoded = safeEncode(`${kept}${marker}`);

  // Cut source characters (not encoded bytes) until the encoded result fits.
  while (encoded.length > budget && kept.length > 0) {
    const overflow = encoded.length - budget;
    const nextLength = Math.max(0, kept.length - Math.max(1, Math.ceil(overflow / 3)));
    kept = kept.slice(0, nextLength);
    encoded = safeEncode(`${kept}${marker}`);
  }

  if (encoded.length > budget) {
    kept = "";
    encoded = safeEncode(marker);
  }

  return {
    href: `${prefix}${encoded}`,
    truncated: true,
    keptCharacters: kept.length,
    originalCharacters,
    encodedLength: prefix.length + encoded.length,
  };
}
