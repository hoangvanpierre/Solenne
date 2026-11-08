/**
 * Client-side checkout idempotency helpers.
 *
 * A key is generated for the first submission and REUSED for every retry of
 * the same payload (same email, address, notes and cart). If the visitor edits
 * anything that changes the order, the signature changes and a new key is
 * generated — otherwise the database would correctly reject the request as
 * "same key, different payload".
 *
 * The database is still the enforcement point: `orders (user_id,
 * checkout_idempotency_key)` is unique. This module only makes the client
 * present a stable key across ambiguous network retries.
 */

export interface CheckoutIdempotencyPayload {
  email: string;
  shippingAddress: Record<string, unknown>;
  items: ReadonlyArray<{ variantId: string; quantity: number }>;
  notes?: string | null;
}

export interface CheckoutIdempotencyState {
  signature: string;
  key: string;
}

export const CHECKOUT_IDEMPOTENCY_STORAGE_KEY =
  "solenne:checkout-idempotency";

export interface IdempotencyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The exact shape enforced by migration 0016:
 * `checkout_idempotency_key ~ '^[A-Za-z0-9._:-]+$'` and length 8–128.
 */
const CHECKOUT_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidCheckoutIdempotencyKey(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    CHECKOUT_IDEMPOTENCY_KEY_PATTERN.test(value)
  );
}

function normalizeAddress(
  address: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(address).sort()) {
    const value = address[key];
    if (value === undefined) continue;
    normalized[key] = typeof value === "string" ? value.trim() : value;
  }
  return normalized;
}

/**
 * Stable signature of everything that becomes part of the order. Items are
 * sorted so cart reordering does not rotate the key, and text is trimmed so
 * whitespace-only edits do not either.
 */
export function checkoutPayloadSignature(
  payload: CheckoutIdempotencyPayload
): string {
  return JSON.stringify({
    email: payload.email.trim().toLowerCase(),
    shippingAddress: normalizeAddress(payload.shippingAddress),
    items: payload.items
      .map((item) => ({
        variantId: item.variantId.trim().toLowerCase(),
        quantity: item.quantity,
      }))
      .sort(
        (a, b) =>
          a.variantId.localeCompare(b.variantId) || a.quantity - b.quantity
      ),
    notes: (payload.notes ?? "").trim(),
  });
}

/**
 * Keep the previous key while the payload is unchanged; rotate it as soon as
 * the payload differs. `generateKey` is injected so the behaviour is testable.
 */
export function nextCheckoutIdempotencyState(
  previous: CheckoutIdempotencyState | null,
  signature: string,
  generateKey: () => string
): { state: CheckoutIdempotencyState; rotated: boolean } {
  if (
    previous &&
    previous.signature === signature &&
    isValidCheckoutIdempotencyKey(previous.key)
  ) {
    return { state: previous, rotated: false };
  }

  return {
    state: { signature, key: generateKey() },
    rotated: true,
  };
}

/**
 * A pending key is parked in sessionStorage so an ambiguous failure followed
 * by a reload still retries with the same key. Corrupt or unavailable storage
 * is treated as "no previous key" — never as a reason to fail checkout.
 */
export function readStoredCheckoutIdempotency(
  storage: IdempotencyStorage | null | undefined
): CheckoutIdempotencyState | null {
  try {
    const raw = storage?.getItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CheckoutIdempotencyState>;
    if (
      typeof parsed.signature === "string" &&
      isValidCheckoutIdempotencyKey(parsed.key)
    ) {
      return { signature: parsed.signature, key: parsed.key };
    }
  } catch {
    // Ignore corrupt JSON and storage access errors.
  }

  return null;
}

export function storeCheckoutIdempotency(
  storage: IdempotencyStorage | null | undefined,
  state: CheckoutIdempotencyState
): void {
  try {
    storage?.setItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or disabled; the in-memory ref still covers retries
    // on this page.
  }
}

export function clearStoredCheckoutIdempotency(
  storage: IdempotencyStorage | null | undefined
): void {
  try {
    storage?.removeItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY);
  } catch {
    // Nothing to do — a stale key cannot create a duplicate while the payload
    // signature matches, and a different payload rotates it anyway.
  }
}

/** UUID-shaped key in secure contexts; a random fallback elsewhere. */
export function createCheckoutIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;

  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0")
    ).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  // Idempotency keys are not secrets; uniqueness is all that matters. This
  // branch only runs in environments without the Web Crypto API.
  return `k-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
