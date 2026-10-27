import test from "node:test";
import assert from "node:assert/strict";
import {
  orderStatusSchema,
  transitionOrderStatusSchema,
} from "../../lib/validations/orders.ts";
import {
  createProductSchema,
  updateVariantSchema,
} from "../../lib/validations/product.ts";

const ORDER_ID = "33333333-3333-4333-8333-333333333333";

const validProduct = {
  slug: "midnight-garden",
  name: "Midnight Garden",
  description:
    "A quiet floral candle with jasmine, rose and a soft vanilla base.",
  category: "floral",
  basePrice: 48,
  scentTop: ["jasmine"],
  scentHeart: ["rose"],
  scentBase: ["vanilla"],
  images: [],
  variants: [
    {
      name: "220g",
      size: "220g",
      price: 48,
      sku: "MG-220",
      initialStock: 10,
    },
  ],
};

test("order status schema accepts exactly the six lifecycle statuses", () => {
  for (const status of [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ]) {
    assert.equal(orderStatusSchema.safeParse(status).success, true, status);
  }

  assert.equal(orderStatusSchema.safeParse("refunded").success, false);
});

test("fulfillment validation requires a tracking code for shipped", () => {
  const withoutTracking = transitionOrderStatusSchema.safeParse({
    orderId: ORDER_ID,
    targetStatus: "shipped",
  });
  assert.equal(withoutTracking.success, false);
  if (!withoutTracking.success) {
    assert.equal(
      withoutTracking.error.issues.some(
        (issue) => issue.path[0] === "trackingCode"
      ),
      true
    );
  }

  assert.equal(
    transitionOrderStatusSchema.safeParse({
      orderId: ORDER_ID,
      targetStatus: "shipped",
      trackingCode: "  ",
    }).success,
    false
  );

  assert.equal(
    transitionOrderStatusSchema.safeParse({
      orderId: ORDER_ID,
      targetStatus: "shipped",
      trackingCode: "TRACK-123",
    }).success,
    true
  );
});

test("fulfillment validation rejects invalid ids and allows empty optional text", () => {
  assert.equal(
    transitionOrderStatusSchema.safeParse({
      orderId: "not-a-uuid",
      targetStatus: "processing",
    }).success,
    false
  );

  assert.equal(
    transitionOrderStatusSchema.safeParse({
      orderId: ORDER_ID,
      targetStatus: "processing",
      trackingCode: "",
      reason: "",
    }).success,
    true
  );
});

test("product creation accepts a canonical product and rejects unknown keys", () => {
  assert.equal(createProductSchema.safeParse(validProduct).success, true);

  assert.equal(
    createProductSchema.safeParse({ ...validProduct, unexpected: true }).success,
    false
  );

  assert.equal(
    createProductSchema.safeParse({ ...validProduct, slug: "Midnight Garden" })
      .success,
    false
  );

  assert.equal(
    createProductSchema.safeParse({ ...validProduct, category: "citrus" })
      .success,
    false
  );

  assert.equal(
    createProductSchema.safeParse({ ...validProduct, basePrice: -1 }).success,
    false
  );
});

test("product creation rejects stock at product level and on variants", () => {
  assert.equal(
    createProductSchema.safeParse({ ...validProduct, stock_quantity: 5 }).success,
    false
  );

  assert.equal(
    createProductSchema.safeParse({
      ...validProduct,
      variants: [
        {
          name: "220g",
          price: 48,
          stock_quantity: 10,
        },
      ],
    }).success,
    false
  );

  assert.equal(
    createProductSchema.safeParse({
      ...validProduct,
      variants: [{ name: "220g", price: -1 }],
    }).success,
    false
  );
});

test("variant updates reject stock mutations and accept ordinary edits", () => {
  assert.equal(
    updateVariantSchema.safeParse({
      name: "220g",
      size: "220g",
      price: 48,
      sku: "MG-220",
    }).success,
    true
  );

  assert.equal(
    updateVariantSchema.safeParse({ name: "220g", stock_quantity: 10 }).success,
    false
  );

  assert.equal(
    updateVariantSchema.safeParse({ name: "220g", initialStock: 10 }).success,
    false
  );

  assert.equal(
    updateVariantSchema.safeParse({ name: "220g", unknownField: true }).success,
    false
  );
});
