"use client";

import { useEffect, useRef } from "react";
import { Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { useWishlist } from "./wishlist-provider";

// ---------------------------------------------------------------------------
// The single heart control used by the product card, the product detail page
// and the account wishlist. One component means one saved/unsaved language,
// one pending state and one accessible contract:
//   * `aria-pressed` exposes the toggle state
//   * `aria-label` names the product and the action it performs
//   * `aria-busy` + a spinner expose the in-flight state
//
// State comes from <WishlistProvider>, so every heart on the page agrees and no
// card issues its own request.
// ---------------------------------------------------------------------------

export interface WishlistButtonProps {
  productId: string;
  /** Used in the accessible label: "Add {name} to your wishlist". */
  productName: string;
  variant?: "icon" | "full";
  className?: string;
  /** Restarted on a successful save (the product card's pop keyframe). */
  pulseClassName?: string;
}

export function WishlistButton({
  productId,
  productName,
  variant = "icon",
  className,
  pulseClassName,
}: WishlistButtonProps) {
  const t = useTranslations("wishlist");
  const { isSaved, isPending, toggle } = useWishlist();

  const saved = isSaved(productId);
  const pending = isPending(productId);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const previousSaved = useRef(saved);
  const mounted = useRef(false);

  // Pulse only on a real transition to "saved" — never on first render, so a
  // pre-saved product does not animate when the page loads.
  useEffect(() => {
    const wasSaved = previousSaved.current;
    previousSaved.current = saved;

    if (!mounted.current) {
      mounted.current = true;
      return;
    }

    if (!saved || wasSaved || !pulseClassName) return;

    const node = buttonRef.current;
    if (!node) return;

    node.classList.remove(pulseClassName);
    // Force a reflow so the keyframe restarts on repeated saves.
    void node.offsetWidth;
    node.classList.add(pulseClassName);
  }, [saved, pulseClassName]);

  const label = saved
    ? t("removeLabel", { name: productName })
    : t("addLabel", { name: productName });

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // The card heart sits inside the product <Link>: without this the click
    // would also navigate to the product page.
    event.preventDefault();
    event.stopPropagation();
    toggle(productId);
  };

  const heart = (
    <Heart
      className={cn(
        "h-4 w-4 transition-colors duration-200",
        saved && "fill-current"
      )}
      aria-hidden="true"
    />
  );

  if (variant === "full") {
    return (
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={saved}
        aria-busy={pending || undefined}
        aria-label={label}
        data-saved={saved ? "true" : "false"}
        className={cn(
          "w-full gap-2 text-muted-foreground",
          saved && "text-destructive",
          className
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          heart
        )}
        <span>{saved ? t("savedCta") : t("addCta")}</span>
      </Button>
    );
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-pressed={saved}
      aria-busy={pending || undefined}
      aria-label={label}
      title={saved ? t("savedCta") : t("addCta")}
      data-saved={saved ? "true" : "false"}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/75 text-warm-black shadow-sm backdrop-blur-md",
        "transition-colors duration-200 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "disabled:cursor-progress disabled:opacity-70",
        saved && "text-destructive",
        className
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        heart
      )}
    </button>
  );
}
