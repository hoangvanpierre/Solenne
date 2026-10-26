import type { OrderStatus, PermissionKey } from "@/types";
import type { AssistantFulfillmentTarget } from "./schemas";

// ---------------------------------------------------------------------------
// Solenne admin assistant — Phase 3 action PROPOSALS.
//
// A proposal is DATA. Nothing in this module writes, calls an RPC, opens a
// client or reaches the network. It takes the current state that a read helper
// already loaded and answers one question: "would the real server action accept
// this change right now, and what exactly would it do?"
//
// The rules below are copied from the trusted boundary, not invented:
//
//   cancel       0006_cancel_order_atomic.sql
//                only pending/paid/processing, never twice, restores stock
//   fulfillment  0007_order_fulfillment_transitions.sql
//                pending|paid -> processing, processing -> shipped (tracking),
//                shipped -> delivered, shipped -> processing (order.cancel +
//                reason), paid/cancelled never targets, delivered/cancelled
//                never sources
//   inventory    0009_inventory_adjust_atomic.sql
//                delta != 0, reason 3..255 chars, resulting stock >= 0
//
// The real server action re-validates everything again (zod + authz + the
// atomic RPC). A proposal is a convenience for the operator, never a bypass.
//
// This module has no runtime imports, so scripts/verify-admin-assistant.mjs can
// import it directly with Node's type stripping.
// ---------------------------------------------------------------------------

export const PROPOSAL_TYPES = [
  "cancel_order",
  "fulfillment_transition",
  "inventory_adjustment",
] as const;

export type ProposalType = (typeof PROPOSAL_TYPES)[number];

export type ProposalStatus = "ready" | "blocked";

/** Stable codes so the harness can assert the exact precondition that failed. */
export type ProposalBlockerCode =
  | "FORBIDDEN"
  | "ORDER_NOT_FOUND"
  | "ORDER_ALREADY_CANCELLED"
  | "ORDER_STATUS_NOT_CANCELLABLE"
  | "ORDER_ALREADY_IN_STATUS"
  | "INVALID_STATUS_TRANSITION"
  | "PAYMENT_STATUS_TRANSITION_DISALLOWED"
  | "ROLLBACK_FORBIDDEN"
  | "INVALID_DELTA"
  | "REASON_REQUIRED"
  | "REASON_INVALID"
  | "INSUFFICIENT_STOCK"
  | "VARIANT_NOT_FOUND"
  | "VARIANT_AMBIGUOUS";

export interface ProposalParams {
  orderNumber?: string;
  fromStatus?: OrderStatus;
  toStatus?: AssistantFulfillmentTarget;
  variantRef?: string;
  variantId?: string;
  previousStock?: number;
  newStock?: number;
  delta?: number;
  reason?: string | null;
}

/**
 * Exactly what the drawer receives from a propose tool. `targetId` is the uuid
 * the existing server action needs; `targetRef` is the human-facing reference
 * (order number or SKU) shown on the card.
 */
export interface AssistantProposal {
  kind: "proposal";
  type: ProposalType;
  status: ProposalStatus;
  targetRef: string;
  targetId: string | null;
  targetLabel: string;
  params: ProposalParams;
  humanSummary: string;
  warnings: string[];
  warningCodes: string[];
  blockers: string[];
  blockerCodes: ProposalBlockerCode[];
  createdAt: string;
  /**
   * Fingerprint of the state the proposal was built from. The drawer cannot
   * re-read the database, so this is displayed in the audit trail and used to
   * explain staleness; the real action still re-validates server-side.
   */
  stateFingerprint: string;
}

export type ProposalLocale = "en" | "vi";

/** Mirrors components/admin/stock-status-badge.tsx (LOW_STOCK_THRESHOLD). */
export const PROPOSAL_LOW_STOCK_THRESHOLD = 10;

/** A proposal older than five minutes must be refreshed before it is applied. */
export const PROPOSAL_MAX_AGE_MS = 5 * 60 * 1000;

export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  "pending",
  "paid",
  "processing",
];

/** The only targets 0007 allows through update_order_status(). */
export const FULFILLMENT_TARGETS: readonly AssistantFulfillmentTarget[] = [
  "processing",
  "shipped",
  "delivered",
];

export const INVENTORY_REASON_MIN = 3;
export const INVENTORY_REASON_MAX = 255;
export const CANCEL_REASON_MAX = 500;

export interface ProposalOrderState {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  trackingCode: string | null;
  unitsCount: number;
  updatedAt: string;
}

export interface ProposalVariantState {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string | null;
  stock: number;
}

// ---------------------------------------------------------------------------
// Localized copy
// ---------------------------------------------------------------------------

const BLOCKER_TEXT: Record<ProposalBlockerCode, { en: string; vi: string }> = {
  FORBIDDEN: {
    en: "Your role does not hold the permission this action requires.",
    vi: "Vai trò của bạn không có quyền cần thiết cho thao tác này.",
  },
  ORDER_NOT_FOUND: {
    en: "No order matches that order number.",
    vi: "Không tìm thấy đơn hàng với mã này.",
  },
  ORDER_ALREADY_CANCELLED: {
    en: "This order has already been cancelled.",
    vi: "Đơn hàng này đã được hủy trước đó.",
  },
  ORDER_STATUS_NOT_CANCELLABLE: {
    en: "Only pending, paid or processing orders can be cancelled.",
    vi: "Chỉ có thể hủy đơn ở trạng thái chờ thanh toán, đã thanh toán hoặc đang chế tác.",
  },
  ORDER_ALREADY_IN_STATUS: {
    en: "The order is already in that status.",
    vi: "Đơn hàng đã ở trạng thái đó.",
  },
  INVALID_STATUS_TRANSITION: {
    en: "The fulfillment workflow does not permit this status transition.",
    vi: "Quy trình giao vận không cho phép chuyển trạng thái này.",
  },
  PAYMENT_STATUS_TRANSITION_DISALLOWED: {
    en: "Payment status cannot be changed through the fulfillment workflow.",
    vi: "Không thể thay đổi trạng thái thanh toán qua quy trình giao vận.",
  },
  ROLLBACK_FORBIDDEN: {
    en: "Rolling a shipment back to processing requires the cancellation permission.",
    vi: "Chuyển lùi đơn đã gửi về đang chế tác cần quyền hủy đơn.",
  },
  INVALID_DELTA: {
    en: "The stock adjustment cannot be zero.",
    vi: "Mức điều chỉnh tồn kho không được bằng 0.",
  },
  REASON_REQUIRED: {
    en: "A reason of at least 3 characters is required.",
    vi: "Bắt buộc nhập lý do tối thiểu 3 ký tự.",
  },
  REASON_INVALID: {
    en: "The reason cannot exceed 255 characters.",
    vi: "Lý do không được vượt quá 255 ký tự.",
  },
  INSUFFICIENT_STOCK: {
    en: "Stock cannot fall below zero.",
    vi: "Tồn kho không được giảm xuống dưới 0.",
  },
  VARIANT_NOT_FOUND: {
    en: "No product variant matches that reference.",
    vi: "Không tìm thấy phiên bản sản phẩm phù hợp.",
  },
  VARIANT_AMBIGUOUS: {
    en: "More than one variant matches. Ask for the SKU or the exact variant name.",
    vi: "Có nhiều phiên bản trùng khớp. Hãy hỏi mã SKU hoặc tên chính xác của phiên bản.",
  },
};

export function describeBlocker(
  code: ProposalBlockerCode,
  locale: ProposalLocale
): string {
  return BLOCKER_TEXT[code][locale];
}

function blockerList(
  codes: readonly ProposalBlockerCode[],
  locale: ProposalLocale
): string[] {
  return codes.map((code) => describeBlocker(code, locale));
}

function statusLabel(status: OrderStatus, locale: ProposalLocale): string {
  if (locale === "en") return status;
  const vi: Record<OrderStatus, string> = {
    pending: "chờ thanh toán",
    paid: "đã thanh toán",
    processing: "đang chế tác",
    shipped: "đã gửi",
    delivered: "đã giao",
    cancelled: "đã hủy",
  };
  return vi[status];
}

function unitsLabel(count: number, locale: ProposalLocale): string {
  if (locale === "vi") return `${count} sản phẩm`;
  return `${count} ${count === 1 ? "unit" : "units"}`;
}

function signed(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

// ---------------------------------------------------------------------------
// Preconditions — pure, one per action, mirroring the SQL exactly.
// ---------------------------------------------------------------------------

/**
 * 0006: authenticated caller with order.cancel, order not already cancelled,
 * current status in (pending, paid, processing).
 */
export function validateCancelPrecondition(
  state: Pick<ProposalOrderState, "status">,
  permissions: readonly PermissionKey[]
): ProposalBlockerCode[] {
  const codes: ProposalBlockerCode[] = [];

  if (!permissions.includes("order.cancel")) codes.push("FORBIDDEN");

  if (state.status === "cancelled") {
    codes.push("ORDER_ALREADY_CANCELLED");
  } else if (!CANCELLABLE_ORDER_STATUSES.includes(state.status)) {
    codes.push("ORDER_STATUS_NOT_CANCELLABLE");
  }

  return codes;
}

/**
 * 0007: forward transitions need order.update; the shipped -> processing
 * rollback needs order.cancel AND a reason; 'paid' and 'cancelled' are never
 * valid targets; delivered/cancelled are terminal sources.
 */
export function validateFulfillmentPrecondition(
  state: Pick<ProposalOrderState, "status">,
  target: AssistantFulfillmentTarget | string,
  permissions: readonly PermissionKey[]
): ProposalBlockerCode[] {
  const codes: ProposalBlockerCode[] = [];
  const from = state.status;

  // `paid` is only ever set by payment confirmation, and `cancelled` is not a
  // fulfillment target at all — both are rejected before the transition table.
  if (target === "paid") {
    codes.push("PAYMENT_STATUS_TRANSITION_DISALLOWED");
    return codes;
  }

  if (target === "cancelled") {
    codes.push("INVALID_STATUS_TRANSITION");
    return codes;
  }

  if (!(FULFILLMENT_TARGETS as readonly string[]).includes(target)) {
    codes.push("INVALID_STATUS_TRANSITION");
    return codes;
  }

  if (from === target) {
    codes.push("ORDER_ALREADY_IN_STATUS");
    return codes;
  }

  if (from === "delivered" || from === "cancelled") {
    codes.push("INVALID_STATUS_TRANSITION");
    return codes;
  }

  const rollback = from === "shipped" && target === "processing";

  if (rollback) {
    if (!permissions.includes("order.cancel")) codes.push("ROLLBACK_FORBIDDEN");
    return codes;
  }

  if (!permissions.includes("order.update")) codes.push("FORBIDDEN");

  const forwardAllowed =
    ((from === "pending" || from === "paid") && target === "processing") ||
    (from === "processing" && target === "shipped") ||
    (from === "shipped" && target === "delivered");

  if (!forwardAllowed) codes.push("INVALID_STATUS_TRANSITION");

  return codes;
}

/**
 * 0009: delta != 0, reason 3..255 characters, resulting stock >= 0, and the
 * caller must hold inventory.update.
 */
export function validateInventoryPrecondition(input: {
  stock: number;
  delta: number;
  reason: string;
  permissions: readonly PermissionKey[];
}): ProposalBlockerCode[] {
  const codes: ProposalBlockerCode[] = [];
  const trimmed = input.reason.trim();

  if (!input.permissions.includes("inventory.update")) codes.push("FORBIDDEN");
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    codes.push("INVALID_DELTA");
  }
  if (trimmed.length < INVENTORY_REASON_MIN) codes.push("REASON_REQUIRED");
  if (trimmed.length > INVENTORY_REASON_MAX) codes.push("REASON_INVALID");
  if (input.stock + input.delta < 0) codes.push("INSUFFICIENT_STOCK");

  return codes;
}

// ---------------------------------------------------------------------------
// Staleness
// ---------------------------------------------------------------------------

/** Age in ms, or Infinity when the timestamp is unreadable (fail safe). */
export function proposalAgeMs(
  createdAt: string,
  now: Date = new Date()
): number {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return Number.POSITIVE_INFINITY;
  return Math.max(0, now.getTime() - created);
}

/**
 * A proposal is stale after five minutes or when its timestamp cannot be read.
 * The drawer disables confirmation and asks for a fresh proposal; the real
 * action re-validates the target state anyway.
 */
export function isProposalStale(
  createdAt: string,
  now: Date = new Date(),
  maxAgeMs: number = PROPOSAL_MAX_AGE_MS
): boolean {
  return proposalAgeMs(createdAt, now) > maxAgeMs;
}

// ---------------------------------------------------------------------------
// Builders — state in, proposal out. No I/O.
// ---------------------------------------------------------------------------

export interface BuildCancelProposalInput {
  state: ProposalOrderState | null;
  orderNumber: string;
  reason?: string;
  permissions: readonly PermissionKey[];
  locale: ProposalLocale;
  now?: Date;
}

export function buildCancelProposal(
  input: BuildCancelProposalInput
): AssistantProposal {
  const { state, orderNumber, permissions, locale } = input;
  const reason = input.reason?.trim() || null;
  const createdAt = (input.now ?? new Date()).toISOString();

  if (!state) {
    return blockedProposal({
      type: "cancel_order",
      targetRef: orderNumber,
      targetId: null,
      targetLabel: orderNumber,
      params: { orderNumber, reason },
      code: "ORDER_NOT_FOUND",
      locale,
      createdAt,
      stateFingerprint: `order:${orderNumber}:missing`,
    });
  }

  const codes = validateCancelPrecondition(state, permissions);
  const warningCodes: string[] = [];
  const warnings: string[] = [];

  if (state.unitsCount > 0) {
    warningCodes.push("CANCEL_RESTORES_STOCK");
    warnings.push(
      locale === "vi"
        ? `Hủy đơn sẽ hoàn lại ${unitsLabel(state.unitsCount, locale)} vào kho.`
        : `Cancelling restores ${unitsLabel(state.unitsCount, locale)} to inventory.`
    );
  }

  if (!reason) {
    warningCodes.push("CANCEL_REASON_OPTIONAL");
    warnings.push(
      locale === "vi"
        ? "Lý do hủy là không bắt buộc; hồ sơ kiểm toán sẽ ghi mặc định."
        : "The cancellation reason is optional; the audit record will use the default note."
    );
  }

  const summary =
    locale === "vi"
      ? `Hủy đơn ${state.orderNumber} (${statusLabel(state.status, locale)}). ${unitsLabel(state.unitsCount, locale)} sẽ được hoàn lại kho.`
      : `Cancel order ${state.orderNumber} (${statusLabel(state.status, locale)}). ${unitsLabel(state.unitsCount, locale)} will be returned to inventory.`;

  return {
    kind: "proposal",
    type: "cancel_order",
    status: codes.length === 0 ? "ready" : "blocked",
    targetRef: state.orderNumber,
    targetId: state.orderId,
    targetLabel: `${state.orderNumber} · ${statusLabel(state.status, locale)}`,
    params: {
      orderNumber: state.orderNumber,
      fromStatus: state.status,
      reason,
    },
    humanSummary: summary,
    warnings,
    warningCodes,
    blockers: blockerList(codes, locale),
    blockerCodes: codes,
    createdAt,
    stateFingerprint: `order:${state.orderId}:${state.status}`,
  };
}

export interface BuildFulfillmentProposalInput {
  state: ProposalOrderState | null;
  orderNumber: string;
  toStatus: AssistantFulfillmentTarget;
  permissions: readonly PermissionKey[];
  locale: ProposalLocale;
  now?: Date;
}

export function buildFulfillmentProposal(
  input: BuildFulfillmentProposalInput
): AssistantProposal {
  const { state, orderNumber, toStatus, permissions, locale } = input;
  const createdAt = (input.now ?? new Date()).toISOString();

  if (!state) {
    return blockedProposal({
      type: "fulfillment_transition",
      targetRef: orderNumber,
      targetId: null,
      targetLabel: orderNumber,
      params: { orderNumber, toStatus },
      code: "ORDER_NOT_FOUND",
      locale,
      createdAt,
      stateFingerprint: `order:${orderNumber}:missing`,
    });
  }

  const codes = validateFulfillmentPrecondition(state, toStatus, permissions);
  const warningCodes: string[] = [];
  const warnings: string[] = [];
  const rollback = state.status === "shipped" && toStatus === "processing";

  if (rollback) {
    warningCodes.push("ROLLBACK_CLEARS_TRACKING");
    warnings.push(
      locale === "vi"
        ? "Mã vận đơn hiện tại sẽ bị xóa."
        : "The current tracking code will be cleared."
    );

    if (!codes.includes("ROLLBACK_FORBIDDEN")) {
      warningCodes.push("ROLLBACK_REASON_REQUIRED");
      warnings.push(
        locale === "vi"
          ? "Bắt buộc nhập lý do chuyển lùi (3–500 ký tự) khi xác nhận."
          : "A rollback reason (3–500 characters) is required at confirmation."
      );
    }
  }

  if (toStatus === "shipped") {
    warningCodes.push("TRACKING_REQUIRED");
    warnings.push(
      locale === "vi"
        ? "Cần nhập mã vận đơn (3–100 ký tự) khi xác nhận gửi hàng."
        : "A tracking code (3–100 characters) is required at confirmation."
    );
  }

  const summary =
    locale === "vi"
      ? `Chuyển đơn ${state.orderNumber} từ ${statusLabel(state.status, locale)} sang ${statusLabel(toStatus, locale)}.`
      : `Move order ${state.orderNumber} from ${statusLabel(state.status, locale)} to ${statusLabel(toStatus, locale)}.`;

  return {
    kind: "proposal",
    type: "fulfillment_transition",
    status: codes.length === 0 ? "ready" : "blocked",
    targetRef: state.orderNumber,
    targetId: state.orderId,
    targetLabel: `${state.orderNumber} · ${statusLabel(state.status, locale)} → ${statusLabel(toStatus, locale)}`,
    params: {
      orderNumber: state.orderNumber,
      fromStatus: state.status,
      toStatus,
    },
    humanSummary: summary,
    warnings,
    warningCodes,
    blockers: blockerList(codes, locale),
    blockerCodes: codes,
    createdAt,
    stateFingerprint: `order:${state.orderId}:${state.status}`,
  };
}

export interface BuildInventoryProposalInput {
  variant: ProposalVariantState | null;
  candidates?: readonly ProposalVariantState[];
  variantRef: string;
  delta: number;
  reason: string;
  permissions: readonly PermissionKey[];
  locale: ProposalLocale;
  now?: Date;
}

export function buildInventoryProposal(
  input: BuildInventoryProposalInput
): AssistantProposal {
  const { variant, candidates = [], variantRef, delta, reason, permissions, locale } =
    input;
  const trimmed = reason.trim();
  const createdAt = (input.now ?? new Date()).toISOString();

  if (!variant) {
    const code: ProposalBlockerCode =
      candidates.length > 0 ? "VARIANT_AMBIGUOUS" : "VARIANT_NOT_FOUND";
    const proposal = blockedProposal({
      type: "inventory_adjustment",
      targetRef: variantRef,
      targetId: null,
      targetLabel: variantRef,
      params: { variantRef, delta, reason: trimmed || null },
      code,
      locale,
      createdAt,
      stateFingerprint: `variant:${variantRef}:missing`,
    });

    if (candidates.length > 0) {
      proposal.warnings = candidates.slice(0, 5).map((candidate) => {
        const sku = candidate.sku ? ` (${candidate.sku})` : "";
        return `${candidate.productName} — ${candidate.variantName}${sku}`;
      });
      proposal.warningCodes = ["VARIANT_CANDIDATES"];
    }

    return proposal;
  }

  const codes = validateInventoryPrecondition({
    stock: variant.stock,
    delta,
    reason: trimmed,
    permissions,
  });

  const newStock = variant.stock + delta;
  const warningCodes: string[] = [];
  const warnings: string[] = [];
  const sku = variant.sku ? ` (${variant.sku})` : "";

  if (delta < 0 && newStock >= 0) {
    warningCodes.push("STOCK_DECREASE");
    warnings.push(
      locale === "vi"
        ? `Điều chỉnh này giảm ${Math.abs(delta)} đơn vị tồn kho.`
        : `This adjustment removes ${Math.abs(delta)} unit${Math.abs(delta) === 1 ? "" : "s"}.`
    );
  }

  if (newStock >= 0 && newStock <= PROPOSAL_LOW_STOCK_THRESHOLD) {
    warningCodes.push("LOW_STOCK_AFTER");
    warnings.push(
      locale === "vi"
        ? `Tồn kho sau điều chỉnh (${newStock}) sẽ ở mức sắp hết (≤ ${PROPOSAL_LOW_STOCK_THRESHOLD}).`
        : `Resulting stock (${newStock}) will be at or below the low-stock threshold (${PROPOSAL_LOW_STOCK_THRESHOLD}).`
    );
  }

  const summary =
    locale === "vi"
      ? `Điều chỉnh tồn kho ${variant.productName} — ${variant.variantName}${sku} từ ${variant.stock} thành ${newStock} (${signed(delta)}).`
      : `Adjust stock for ${variant.productName} — ${variant.variantName}${sku} from ${variant.stock} to ${newStock} (${signed(delta)}).`;

  return {
    kind: "proposal",
    type: "inventory_adjustment",
    status: codes.length === 0 ? "ready" : "blocked",
    targetRef: variant.sku || variant.variantId,
    targetId: variant.variantId,
    targetLabel: `${variant.productName} — ${variant.variantName}${sku}`,
    params: {
      variantRef,
      variantId: variant.variantId,
      previousStock: variant.stock,
      newStock,
      delta,
      reason: trimmed || null,
    },
    humanSummary: summary,
    warnings,
    warningCodes,
    blockers: blockerList(codes, locale),
    blockerCodes: codes,
    createdAt,
    stateFingerprint: `variant:${variant.variantId}:${variant.stock}`,
  };
}

function blockedProposal(input: {
  type: ProposalType;
  targetRef: string;
  targetId: string | null;
  targetLabel: string;
  params: ProposalParams;
  code: ProposalBlockerCode;
  locale: ProposalLocale;
  createdAt: string;
  stateFingerprint: string;
}): AssistantProposal {
  return {
    kind: "proposal",
    type: input.type,
    status: "blocked",
    targetRef: input.targetRef,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    params: input.params,
    humanSummary:
      input.locale === "vi"
        ? `Không thể đề xuất thao tác cho ${input.targetRef}.`
        : `No proposal can be made for ${input.targetRef}.`,
    warnings: [],
    warningCodes: [],
    blockers: [describeBlocker(input.code, input.locale)],
    blockerCodes: [input.code],
    createdAt: input.createdAt,
    stateFingerprint: input.stateFingerprint,
  };
}
