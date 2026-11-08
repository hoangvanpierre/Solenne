import test from "node:test";
import assert from "node:assert/strict";
import {
  GENERIC_CREATE_ORDER_MESSAGE,
  createOrderErrorMessage,
  parseCreateOrderRpcError,
} from "../../lib/order-rpc-errors.ts";
import {
  checkoutPayloadSignature,
  clearStoredCheckoutIdempotency,
  createCheckoutIdempotencyKey,
  isValidCheckoutIdempotencyKey,
  nextCheckoutIdempotencyState,
  readStoredCheckoutIdempotency,
  storeCheckoutIdempotency,
} from "../../lib/checkout-idempotency.ts";

// ---------------------------------------------------------------------------
// Database error mapping (create_order raises `CODE||detail`)
// ---------------------------------------------------------------------------

test("parses a coded database error and its detail", () => {
  assert.deepEqual(
    parseCreateOrderRpcError(
      "INSUFFICIENT_STOCK||Only 1 left of Midnight Garden (220g). Please adjust your cart."
    ),
    {
      code: "INSUFFICIENT_STOCK",
      detail: "Only 1 left of Midnight Garden (220g). Please adjust your cart.",
    }
  );
});

test("treats an uncoded message as unknown and keeps it only as detail", () => {
  const parsed = parseCreateOrderRpcError("permission denied for function create_order");
  assert.equal(parsed.code, "UNKNOWN");
  assert.equal(parsed.detail, "permission denied for function create_order");
  assert.equal(
    createOrderErrorMessage("permission denied for function create_order"),
    GENERIC_CREATE_ORDER_MESSAGE
  );
});

test("empty or missing messages map to the generic checkout failure", () => {
  assert.equal(createOrderErrorMessage(null), GENERIC_CREATE_ORDER_MESSAGE);
  assert.equal(createOrderErrorMessage("   "), GENERIC_CREATE_ORDER_MESSAGE);
});

test("uses the database detail for stock and availability errors", () => {
  assert.equal(
    createOrderErrorMessage("INSUFFICIENT_STOCK||Only 2 left of Cedar & Sage (300g)."),
    "Only 2 left of Cedar & Sage (300g)."
  );
  assert.equal(
    createOrderErrorMessage('PRODUCT_UNAVAILABLE||"Golden Hour" is no longer available.'),
    '"Golden Hour" is no longer available.'
  );
});

test("uses the localized default for static validation errors", () => {
  assert.equal(
    createOrderErrorMessage("DUPLICATE_VARIANT||whatever"),
    "Your cart contains duplicate items. Please refresh and try again."
  );
  assert.equal(
    createOrderErrorMessage("IDEMPOTENCY_CONFLICT||This checkout was already submitted with different details."),
    "This checkout was already submitted with different details."
  );
});

// ---------------------------------------------------------------------------
// Checkout payload signature
// ---------------------------------------------------------------------------

const ADDRESS = {
  fullName: "Nguyen Van A",
  phone: "0901234567",
  line1: "123 Le Loi",
  city: "Ho Chi Minh City",
  postalCode: "700000",
  country: "Vietnam",
};

const ITEMS = [
  { variantId: "11111111-1111-4111-8111-111111111111", quantity: 2 },
  { variantId: "22222222-2222-4222-8222-222222222222", quantity: 1 },
];

test("the signature is stable across cart reordering", () => {
  const forward = checkoutPayloadSignature({
    email: "a@example.com",
    shippingAddress: ADDRESS,
    items: ITEMS,
    notes: "",
  });
  const reversed = checkoutPayloadSignature({
    email: "a@example.com",
    shippingAddress: ADDRESS,
    items: [...ITEMS].reverse(),
    notes: "",
  });

  assert.equal(forward, reversed);
});

test("whitespace and email case do not rotate the key", () => {
  const base = checkoutPayloadSignature({
    email: "a@example.com",
    shippingAddress: ADDRESS,
    items: ITEMS,
    notes: "",
  });
  const padded = checkoutPayloadSignature({
    email: "  A@Example.com ",
    shippingAddress: {
      ...ADDRESS,
      fullName: "  Nguyen Van A ",
      line1: " 123 Le Loi ",
    },
    items: ITEMS,
    notes: "   ",
  });

  assert.equal(base, padded);
});

test("a different quantity, address, email or note changes the signature", () => {
  const base = checkoutPayloadSignature({
    email: "a@example.com",
    shippingAddress: ADDRESS,
    items: ITEMS,
    notes: "",
  });

  assert.notEqual(
    base,
    checkoutPayloadSignature({
      email: "a@example.com",
      shippingAddress: ADDRESS,
      items: [{ ...ITEMS[0], quantity: 3 }, ITEMS[1]],
      notes: "",
    })
  );
  assert.notEqual(
    base,
    checkoutPayloadSignature({
      email: "a@example.com",
      shippingAddress: { ...ADDRESS, line1: "456 Nguyen Hue" },
      items: ITEMS,
      notes: "",
    })
  );
  assert.notEqual(
    base,
    checkoutPayloadSignature({
      email: "a@example.com",
      shippingAddress: { ...ADDRESS, postalCode: "700001" },
      items: ITEMS,
      notes: "",
    })
  );
  assert.notEqual(
    base,
    checkoutPayloadSignature({
      email: "b@example.com",
      shippingAddress: ADDRESS,
      items: ITEMS,
      notes: "",
    })
  );
  assert.notEqual(
    base,
    checkoutPayloadSignature({
      email: "a@example.com",
      shippingAddress: ADDRESS,
      items: ITEMS,
      notes: "Leave at reception",
    })
  );
});

// ---------------------------------------------------------------------------
// Key rotation across retries
// ---------------------------------------------------------------------------

test("retrying the same payload keeps the original key", () => {
  const signature = "same-payload";
  const first = nextCheckoutIdempotencyState(null, signature, () => "key-0001");
  assert.equal(first.rotated, true);
  assert.equal(first.state.key, "key-0001");

  const retry = nextCheckoutIdempotencyState(first.state, signature, () => "key-0002");
  assert.equal(retry.rotated, false);
  assert.equal(retry.state.key, "key-0001");
});

test("changing the payload rotates the key", () => {
  const first = nextCheckoutIdempotencyState(null, "payload-a", () => "key-0001");
  const changed = nextCheckoutIdempotencyState(first.state, "payload-b", () => "key-0002");

  assert.equal(changed.rotated, true);
  assert.equal(changed.state.key, "key-0002");
});

test("generated keys satisfy the database's key shape", () => {
  const pattern = /^[A-Za-z0-9._:-]{8,128}$/;
  const first = createCheckoutIdempotencyKey();
  const second = createCheckoutIdempotencyKey();

  assert.match(first, pattern);
  assert.match(second, pattern);
  assert.notEqual(first, second);
});

// ---------------------------------------------------------------------------
// Persisting a pending key across a reload
// ---------------------------------------------------------------------------

class MemoryStorage {
  map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

test("a pending key survives a reload via sessionStorage", () => {
  const storage = new MemoryStorage();
  const state = { signature: "payload-a", key: "key-0001" };

  storeCheckoutIdempotency(storage, state);
  assert.deepEqual(readStoredCheckoutIdempotency(storage), state);

  clearStoredCheckoutIdempotency(storage);
  assert.equal(readStoredCheckoutIdempotency(storage), null);
});

test("corrupt or malformed stored state is ignored", () => {
  const storage = new MemoryStorage();
  storage.setItem("solenne:checkout-idempotency", "{not json");
  assert.equal(readStoredCheckoutIdempotency(storage), null);

  storage.setItem(
    "solenne:checkout-idempotency",
    JSON.stringify({ signature: "x", key: "short" })
  );
  assert.equal(readStoredCheckoutIdempotency(storage), null);

  storage.setItem(
    "solenne:checkout-idempotency",
    JSON.stringify({ signature: 42, key: "long-enough-key" })
  );
  assert.equal(readStoredCheckoutIdempotency(storage), null);
});

test("storage failures never break checkout", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(readStoredCheckoutIdempotency(broken), null);
  assert.doesNotThrow(() =>
    storeCheckoutIdempotency(broken, { signature: "s", key: "key-0001" })
  );
  assert.doesNotThrow(() => clearStoredCheckoutIdempotency(broken));
  assert.equal(readStoredCheckoutIdempotency(null), null);
});

// ---------------------------------------------------------------------------
// Restored keys must match the database CHECK constraint exactly
// ---------------------------------------------------------------------------

const STORAGE_KEY = "solenne:checkout-idempotency";

function storeRawState(storage: MemoryStorage, value: unknown) {
  storage.setItem(STORAGE_KEY, JSON.stringify(value));
}

test("restored keys accept only the database key contract", () => {
  const storage = new MemoryStorage();

  const valid = [
    "abcd1234",
    "123e4567-e89b-42d3-a456-426614174000",
    "A.b_c:d-1234",
    "a".repeat(128),
  ];
  for (const key of valid) {
    storeRawState(storage, { signature: "signature", key });
    assert.deepEqual(
      readStoredCheckoutIdempotency(storage),
      { signature: "signature", key },
      `expected ${key.slice(0, 20)}… to be accepted`
    );
    assert.equal(isValidCheckoutIdempotencyKey(key), true);
  }

  const invalid = [
    "abcdefg", // 7 characters
    "a".repeat(129), // 129 characters
    "abcd 1234", // space
    "abcd/1234", // slash
    "abcd@1234", // at sign
    "abcd!1234", // punctuation outside the contract
    "abcd\n1234", // newline
    "", // empty
  ];
  for (const key of invalid) {
    storeRawState(storage, { signature: "signature", key });
    assert.equal(
      readStoredCheckoutIdempotency(storage),
      null,
      `expected ${JSON.stringify(key).slice(0, 20)}… to be rejected`
    );
    assert.equal(isValidCheckoutIdempotencyKey(key), false);
  }

  storeRawState(storage, { signature: "signature", key: null });
  assert.equal(readStoredCheckoutIdempotency(storage), null);
  assert.equal(isValidCheckoutIdempotencyKey(42), false);
});

test("a malformed previous key is never reused", () => {
  const result = nextCheckoutIdempotencyState(
    { signature: "same-payload", key: "bad key 1" },
    "same-payload",
    () => "fresh-key-0001"
  );

  assert.equal(result.rotated, true);
  assert.equal(result.state.key, "fresh-key-0001");
});

// ---------------------------------------------------------------------------
// Confirmed success must not leak its key into a later purchase
// ---------------------------------------------------------------------------

test("a confirmed checkout rotates the key even for an identical payload", () => {
  const storage = new MemoryStorage();
  const signature = checkoutPayloadSignature({
    email: "a@example.com",
    shippingAddress: ADDRESS,
    items: ITEMS,
    notes: "",
  });

  // 1. First submission: no pending state.
  const first = nextCheckoutIdempotencyState(
    readStoredCheckoutIdempotency(storage),
    signature,
    () => "key-first-0001"
  );
  assert.equal(first.rotated, true);
  assert.equal(first.state.key, "key-first-0001");
  storeCheckoutIdempotency(storage, first.state);

  // 2. Unconfirmed retry of the unchanged payload reuses the key.
  const retry = nextCheckoutIdempotencyState(
    readStoredCheckoutIdempotency(storage),
    signature,
    () => "key-retry-0002"
  );
  assert.equal(retry.rotated, false);
  assert.equal(retry.state.key, "key-first-0001");

  // 3. Confirmed success: the form clears both the ref and the stored state.
  const clearedRef: { signature: string; key: string } | null = null;
  clearStoredCheckoutIdempotency(storage);
  assert.equal(readStoredCheckoutIdempotency(storage), null);

  // 4. A later purchase with the same-looking cart must get a fresh key.
  const next = nextCheckoutIdempotencyState(
    clearedRef,
    signature,
    () => "key-next-0003"
  );
  assert.equal(next.rotated, true);
  assert.equal(next.state.key, "key-next-0003");
});
