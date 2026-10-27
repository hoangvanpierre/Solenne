import test from "node:test";
import assert from "node:assert/strict";
import type { PermissionKey } from "@/types";
import {
  INVENTORY_REASON_MAX,
  PROPOSAL_MAX_AGE_MS,
  buildCancelProposal,
  buildFulfillmentProposal,
  buildInventoryProposal,
  isProposalStale,
  validateCancelPrecondition,
  validateFulfillmentPrecondition,
  validateInventoryPrecondition,
  type ProposalOrderState,
  type ProposalVariantState,
} from "../../lib/admin-assistant/proposals.ts";

// The preconditions mirror migrations 0006/0007/0009. These tests execute the
// real functions, so a change to the status machine fails here rather than
// silently shipping a proposal the RPC will reject.

const CANCEL: PermissionKey[] = ["order.cancel"];
const UPDATE: PermissionKey[] = ["order.update"];
const INVENTORY: PermissionKey[] = ["inventory.update"];

function orderState(overrides: Partial<ProposalOrderState> = {}): ProposalOrderState {
  return {
    orderId: "11111111-1111-4111-8111-111111111111",
    orderNumber: "SLN-ABC-123",
    status: "pending",
    trackingCode: null,
    unitsCount: 2,
    updatedAt: "2026-10-27T00:00:00.000Z",
    ...overrides,
  };
}

function variantState(overrides: Partial<ProposalVariantState> = {}): ProposalVariantState {
  return {
    variantId: "22222222-2222-4222-8222-222222222222",
    productName: "Midnight Garden",
    variantName: "220g",
    sku: "MG-220",
    stock: 12,
    ...overrides,
  };
}

test("cancel: pending, paid and processing are cancellable with order.cancel", () => {
  for (const status of ["pending", "paid", "processing"] as const) {
    assert.deepEqual(validateCancelPrecondition({ status }, CANCEL), [], status);
  }
});

test("cancel: shipped and delivered are rejected", () => {
  assert.deepEqual(validateCancelPrecondition({ status: "shipped" }, CANCEL), [
    "ORDER_STATUS_NOT_CANCELLABLE",
  ]);
  assert.deepEqual(validateCancelPrecondition({ status: "delivered" }, CANCEL), [
    "ORDER_STATUS_NOT_CANCELLABLE",
  ]);
});

test("cancel: an already cancelled order reports the dedicated code", () => {
  assert.deepEqual(validateCancelPrecondition({ status: "cancelled" }, CANCEL), [
    "ORDER_ALREADY_CANCELLED",
  ]);
});

test("cancel: missing order.cancel is forbidden even for a cancellable status", () => {
  assert.deepEqual(validateCancelPrecondition({ status: "pending" }, UPDATE), [
    "FORBIDDEN",
  ]);
});

test("fulfillment: the four forward transitions are allowed with order.update", () => {
  const cases = [
    ["pending", "processing"],
    ["paid", "processing"],
    ["processing", "shipped"],
    ["shipped", "delivered"],
  ] as const;

  for (const [from, to] of cases) {
    assert.deepEqual(
      validateFulfillmentPrecondition({ status: from }, to, UPDATE),
      [],
      `${from} -> ${to}`
    );
  }
});

test("fulfillment: shipped -> processing is a rollback that needs order.cancel, not order.update", () => {
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "shipped" }, "processing", CANCEL),
    []
  );
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "shipped" }, "processing", UPDATE),
    ["ROLLBACK_FORBIDDEN"]
  );
});

test("fulfillment: paid and cancelled can never be targets", () => {
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "pending" }, "paid", UPDATE),
    ["PAYMENT_STATUS_TRANSITION_DISALLOWED"]
  );
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "pending" }, "cancelled", UPDATE),
    ["INVALID_STATUS_TRANSITION"]
  );
});

test("fulfillment: illegal and terminal transitions are rejected", () => {
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "pending" }, "shipped", UPDATE),
    ["INVALID_STATUS_TRANSITION"]
  );
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "delivered" }, "processing", CANCEL),
    ["INVALID_STATUS_TRANSITION"]
  );
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "cancelled" }, "processing", UPDATE),
    ["INVALID_STATUS_TRANSITION"]
  );
  assert.deepEqual(
    validateFulfillmentPrecondition({ status: "processing" }, "processing", UPDATE),
    ["ORDER_ALREADY_IN_STATUS"]
  );
});

test("inventory: a valid restock has no blockers", () => {
  assert.deepEqual(
    validateInventoryPrecondition({
      stock: 5,
      delta: 10,
      reason: "Restock delivery",
      permissions: INVENTORY,
    }),
    []
  );
});

test("inventory: zero delta, short reason, overlong reason and missing permission are rejected", () => {
  const base = {
    stock: 5,
    delta: -1,
    reason: "Damaged",
    permissions: INVENTORY,
  };

  assert.deepEqual(
    validateInventoryPrecondition({ ...base, delta: 0 }),
    ["INVALID_DELTA"]
  );
  assert.deepEqual(
    validateInventoryPrecondition({ ...base, reason: "ab" }),
    ["REASON_REQUIRED"]
  );
  assert.deepEqual(
    validateInventoryPrecondition({
      ...base,
      reason: "x".repeat(INVENTORY_REASON_MAX + 1),
    }),
    ["REASON_INVALID"]
  );
  assert.deepEqual(
    validateInventoryPrecondition({ ...base, permissions: [] }),
    ["FORBIDDEN"]
  );
});

test("inventory: stock can never fall below zero", () => {
  assert.deepEqual(
    validateInventoryPrecondition({
      stock: 3,
      delta: -4,
      reason: "Shrinkage",
      permissions: INVENTORY,
    }),
    ["INSUFFICIENT_STOCK"]
  );

  assert.deepEqual(
    validateInventoryPrecondition({
      stock: 3,
      delta: -3,
      reason: "Shrinkage",
      permissions: INVENTORY,
    }),
    []
  );
});

test("staleness: proposals expire after five minutes and unreadable timestamps fail safe", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");
  const fresh = new Date(now.getTime() - PROPOSAL_MAX_AGE_MS + 1000).toISOString();
  const expired = new Date(now.getTime() - PROPOSAL_MAX_AGE_MS - 1000).toISOString();

  assert.equal(isProposalStale(fresh, now), false);
  assert.equal(isProposalStale(expired, now), true);
  assert.equal(isProposalStale("not-a-date", now), true);
});

test("cancel proposal: a missing order is blocked and never invents a target id", () => {
  const proposal = buildCancelProposal({
    state: null,
    orderNumber: "SLN-MISSING-1",
    permissions: CANCEL,
    locale: "en",
  });

  assert.equal(proposal.kind, "proposal");
  assert.equal(proposal.type, "cancel_order");
  assert.equal(proposal.status, "blocked");
  assert.equal(proposal.targetId, null);
  assert.deepEqual(proposal.blockerCodes, ["ORDER_NOT_FOUND"]);
  assert.equal(proposal.stateFingerprint.includes("missing"), true);
});

test("cancel proposal: units and optional reason are surfaced as warnings, not mutations", () => {
  const proposal = buildCancelProposal({
    state: orderState({ status: "processing", unitsCount: 3 }),
    orderNumber: "SLN-ABC-123",
    permissions: CANCEL,
    locale: "en",
  });

  assert.equal(proposal.status, "ready");
  assert.equal(proposal.targetId, orderState().orderId);
  assert.deepEqual(proposal.warningCodes, [
    "CANCEL_RESTORES_STOCK",
    "CANCEL_REASON_OPTIONAL",
  ]);
  assert.equal(proposal.params.fromStatus, "processing");
  assert.equal(proposal.params.reason, null);
});

test("fulfillment proposal: shipping warns that a tracking code is required at confirmation", () => {
  const proposal = buildFulfillmentProposal({
    state: orderState({ status: "processing" }),
    orderNumber: "SLN-ABC-123",
    toStatus: "shipped",
    permissions: UPDATE,
    locale: "en",
  });

  assert.equal(proposal.status, "ready");
  assert.deepEqual(proposal.warningCodes, ["TRACKING_REQUIRED"]);
  assert.equal(proposal.params.toStatus, "shipped");
});

test("fulfillment proposal: a rollback warns that tracking is cleared and a reason is required", () => {
  const proposal = buildFulfillmentProposal({
    state: orderState({ status: "shipped", trackingCode: "TRACK-9" }),
    orderNumber: "SLN-ABC-123",
    toStatus: "processing",
    permissions: CANCEL,
    locale: "en",
  });

  assert.equal(proposal.status, "ready");
  assert.deepEqual(proposal.warningCodes, [
    "ROLLBACK_CLEARS_TRACKING",
    "ROLLBACK_REASON_REQUIRED",
  ]);
});

test("inventory proposal: computes the resulting stock and reports low stock after the change", () => {
  const proposal = buildInventoryProposal({
    variant: variantState({ stock: 8 }),
    variantRef: "MG-220",
    delta: -2,
    reason: "Damaged units",
    permissions: INVENTORY,
    locale: "en",
  });

  assert.equal(proposal.status, "ready");
  assert.equal(proposal.params.previousStock, 8);
  assert.equal(proposal.params.newStock, 6);
  assert.equal(proposal.params.delta, -2);
  assert.deepEqual(proposal.warningCodes, ["STOCK_DECREASE", "LOW_STOCK_AFTER"]);
});

test("inventory proposal: ambiguous and missing variants are blocked with candidates shown", () => {
  const missing = buildInventoryProposal({
    variant: null,
    variantRef: "UNKNOWN-SKU",
    delta: 1,
    reason: "Restock",
    permissions: INVENTORY,
    locale: "en",
  });
  assert.deepEqual(missing.blockerCodes, ["VARIANT_NOT_FOUND"]);

  const ambiguous = buildInventoryProposal({
    variant: null,
    candidates: [variantState(), variantState({ variantId: "other", sku: "MG-440" })],
    variantRef: "MG",
    delta: 1,
    reason: "Restock",
    permissions: INVENTORY,
    locale: "en",
  });
  assert.deepEqual(ambiguous.blockerCodes, ["VARIANT_AMBIGUOUS"]);
  assert.equal(ambiguous.warnings.length, 2);
  assert.deepEqual(ambiguous.warningCodes, ["VARIANT_CANDIDATES"]);
});
