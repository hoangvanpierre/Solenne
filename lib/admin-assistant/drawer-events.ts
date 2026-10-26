// ---------------------------------------------------------------------------
// Solenne admin assistant — "open the drawer with this order" bridge.
//
// The order page is a Server Component, so it cannot hold drawer state. It
// renders a tiny client button that dispatches this window event; the drawer
// (mounted once in the admin header) listens for it and opens itself with the
// order as context. Nothing beyond the order number and the default reply
// language is passed — every fact in the draft still comes from getOrderDetail.
// reply language — everything else still comes from getOrderDetail.
//
// Dependency-free and guarded so importing it from a server module is a no-op
// instead of a crash.
// ---------------------------------------------------------------------------

export const ADMIN_ASSISTANT_DRAFT_EVENT = "solenne:admin-assistant-draft";

export interface AdminAssistantDraftRequestDetail {
  /** Human-facing order number (SLN-…), never a raw uuid. */
  orderNumber: string;
  /** Default reply language, derived from the shipping country. */
  language: "vi" | "en";
}

/**
 * Ask the drawer to open in drafting mode for one order. Called from a click
 * handler only, so `window` always exists in practice; the guard keeps a
 * server-side import harmless.
 */
export function openAdminAssistantDraft(
  detail: AdminAssistantDraftRequestDetail
): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<AdminAssistantDraftRequestDetail>(
      ADMIN_ASSISTANT_DRAFT_EVENT,
      { detail }
    )
  );
}
