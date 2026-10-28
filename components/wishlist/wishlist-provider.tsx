"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  addToWishlistAction,
  removeFromWishlistAction,
} from "@/app/actions/wishlist";
import { useAuthz } from "@/hooks/use-authz";
import {
  applyWishlistToggle,
  isWishlistSaved,
  wishlistErrorKey,
  wishlistLoginHref,
} from "@/lib/wishlist-core";
import type { WishlistActionState } from "@/lib/validations/wishlist";

// ---------------------------------------------------------------------------
// Shared wishlist state.
//
// One provider per document holds the saved-product ids, hydrated from the
// server (the page passes `initialIds`) — so rendering 40 product cards costs
// zero extra requests. Every heart on the page (cards, detail, the account
// wishlist) reads and writes the same store, which is what keeps their saved
// state consistent without any global state library.
//
// Writes are optimistic but always reconciled: the id is flipped locally, the
// server action runs, and on failure the SAME id is flipped back (only that
// id, so a concurrent save of another product is never reverted). The server's
// response is authoritative for the final state.
// ---------------------------------------------------------------------------

export interface WishlistContextValue {
  /** Saved product ids, newest first. */
  ids: readonly string[];
  /** True when the product is saved. */
  isSaved: (productId: string) => boolean;
  /** True while a save/remove for this product is in flight. */
  isPending: (productId: string) => boolean;
  /** Localized failure message, or null. */
  error: string | null;
  /** Save when unsaved, remove when saved. */
  toggle: (productId: string) => void;
  /** Remove unconditionally (used by the wishlist page). */
  remove: (productId: string) => void;
  /** Dismiss the current error. */
  clearError: () => void;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export interface WishlistProviderProps {
  /** Server-rendered saved ids (empty for guests). */
  initialIds?: readonly string[];
  children: React.ReactNode;
}

export function WishlistProvider({
  initialIds = [],
  children,
}: WishlistProviderProps) {
  const t = useTranslations("wishlist");
  const router = useRouter();
  const pathname = usePathname();
  const { state: authState } = useAuthz();

  // The ids array is mirrored in a ref so a click handler always reads the
  // latest value without re-creating the callbacks on every change.
  const idsRef = useRef<string[]>([...initialIds]);
  const pendingRef = useRef<Set<string>>(new Set());

  const [ids, setIds] = useState<string[]>(() => [...initialIds]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [failure, setFailure] = useState<{
    key: string;
    path: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const commitIds = useCallback((next: string[]) => {
    idsRef.current = next;
    setIds(next);
  }, []);

  const markPending = useCallback((productId: string, pending: boolean) => {
    if (pending) pendingRef.current.add(productId);
    else pendingRef.current.delete(productId);
    setPendingIds([...pendingRef.current]);
  }, []);

  // A failure is recorded together with the route it happened on, so the toast
  // disappears by derivation when the visitor navigates instead of by a
  // setState inside an effect.
  const showFailure = useCallback(
    (key: string) => setFailure({ key, path: pathname }),
    [pathname]
  );

  const clearError = useCallback(() => setFailure(null), []);

  const mutate = useCallback(
    async (productId: string, nextSaved: boolean) => {
      if (pendingRef.current.has(productId)) return;

      setFailure(null);
      markPending(productId, true);
      commitIds(applyWishlistToggle(idsRef.current, productId, nextSaved));

      let result: WishlistActionState | undefined;
      try {
        result = nextSaved
          ? await addToWishlistAction(productId)
          : await removeFromWishlistAction(productId);

        if (result?.success) {
          setAnnouncement(
            nextSaved ? t("announcementSaved") : t("announcementRemoved")
          );
        } else {
          // Roll back only this product, not the whole list.
          commitIds(
            applyWishlistToggle(idsRef.current, productId, !nextSaved)
          );
          showFailure(wishlistErrorKey(result));
        }
      } catch (error) {
        console.error("Wishlist mutation failed:", error);
        commitIds(applyWishlistToggle(idsRef.current, productId, !nextSaved));
        showFailure("actionError");
      } finally {
        markPending(productId, false);
      }
    },
    [commitIds, markPending, showFailure, t]
  );

  const requestChange = useCallback(
    (productId: string, nextSaved: boolean) => {
      if (!productId) return;

      // Guests never reach the database: they are sent to the login form with
      // an internal return path, and the wishlist is restored after sign-in.
      if (authState === "anonymous") {
        router.push(wishlistLoginHref(pathname));
        return;
      }

      if (authState === "restricted") {
        showFailure("errorRestricted");
        return;
      }

      if (authState === "unavailable") {
        showFailure("actionError");
        return;
      }

      void mutate(productId, nextSaved);
    },
    [authState, mutate, pathname, router, showFailure]
  );

  const toggle = useCallback(
    (productId: string) => {
      requestChange(productId, !isWishlistSaved(idsRef.current, productId));
    },
    [requestChange]
  );

  const remove = useCallback(
    (productId: string) => requestChange(productId, false),
    [requestChange]
  );

  const isSaved = useCallback(
    (productId: string) => isWishlistSaved(ids, productId),
    [ids]
  );

  const isPending = useCallback(
    (productId: string) => pendingIds.includes(productId),
    [pendingIds]
  );

  // Auto-dismiss so a transient failure never becomes permanent chrome. This is
  // a setState in a timer callback, not in the effect body.
  useEffect(() => {
    if (!failure) return;
    const timer = setTimeout(() => setFailure(null), 7000);
    return () => clearTimeout(timer);
  }, [failure]);

  // Scoped to the route that produced it, so navigating away clears the toast
  // without any state update during render or in an effect.
  const activeErrorKey =
    failure && failure.path === pathname ? failure.key : null;
  const error = activeErrorKey ? t(activeErrorKey) : null;

  const value = useMemo<WishlistContextValue>(
    () => ({ ids, isSaved, isPending, error, toggle, remove, clearError }),
    [ids, isSaved, isPending, error, toggle, remove, clearError]
  );

  return (
    <WishlistContext.Provider value={value}>
      {children}

      {/* Screen-reader confirmation of a completed save/remove. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {error ? (
        <div
          role="alert"
          className="fixed inset-x-0 bottom-24 z-[60] mx-auto flex w-[min(92vw,26rem)] items-start gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 text-[13px] leading-relaxed text-foreground shadow-lg backdrop-blur-md"
        >
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={clearError}
            aria-label={t("dismiss")}
            className="-mr-1 -mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </WishlistContext.Provider>
  );
}

/**
 * Access the shared wishlist store.
 *
 * Throws when used outside a provider so a missing provider is caught during
 * development instead of silently rendering hearts that never persist.
 */
export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used inside <WishlistProvider>.");
  }
  return context;
}
