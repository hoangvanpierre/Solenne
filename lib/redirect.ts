/**
 * Validate a user-controlled post-login redirect target (`next`).
 *
 * S-2 (open redirect): `next` arrives from the `?next=` query parameter and is
 * submitted with the login/register forms. It must only ever point to an
 * internal path of this application — never an external or protocol-relative
 * URL, and never a dangerous scheme (javascript:, data:, ...).
 *
 * This is intentionally stricter than a `startsWith("/")` check, which would
 * still accept protocol-relative targets like `//evil.example`.
 *
 * Rules:
 *  - accepts relative internal paths (path + optional query/hash), e.g.
 *    `/account`, `/account/orders`, `/checkout/success?x=1`
 *  - rejects absolute URLs (`https://evil.example`), protocol-relative URLs
 *    (`//evil.example`), backslash tricks (`/\evil.example`), control
 *    characters, and anything that does not parse to this fixed base origin
 *  - never returns a value that could redirect outside the current origin
 *
 * Safe fallback for invalid, missing, or unsafe values: `/account`.
 *
 * Pure and synchronous so the same rule can be applied on the server (server
 * actions — authoritative) and in the auth client forms (defense in depth).
 */
const BASE_ORIGIN = "https://solenne.internal";
const FALLBACK_PATH = "/account";

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function sanitizeNextPath(value: string | null | undefined): string {
  if (typeof value !== "string") return FALLBACK_PATH;

  const target = value.trim();
  if (target === "") return FALLBACK_PATH;

  // Internal paths start with exactly one "/". A leading "//" is a
  // protocol-relative URL (//evil.example) and must be rejected.
  if (!target.startsWith("/") || target.startsWith("//")) return FALLBACK_PATH;

  // Browsers normalize "\" to "/" in URLs, so "/\evil.example" would become
  // protocol-relative after a redirect. Reject backslashes outright.
  if (target.includes("\\")) return FALLBACK_PATH;

  // Control characters (tabs, newlines, NUL) can be used to smuggle a scheme
  // past naive prefix checks or to split headers.
  if (hasControlChars(target)) return FALLBACK_PATH;

  // Parse against a fixed base origin. Absolute URLs, protocol-relative URLs,
  // or anything that resolves to a different origin will fail the checks below.
  let url: URL;
  try {
    url = new URL(target, BASE_ORIGIN);
  } catch {
    return FALLBACK_PATH; // malformed value
  }

  if (url.origin !== BASE_ORIGIN || url.protocol !== "https:") {
    return FALLBACK_PATH;
  }

  // Return only same-origin path components — never a full URL.
  return `${url.pathname}${url.search}${url.hash}`;
}