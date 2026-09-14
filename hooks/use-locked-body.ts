import { useEffect, useLayoutEffect } from "react";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Module-level lock counter: when several components (CartDrawer, MobileNav)
// lock the body at overlapping times, each hook instance used to capture and
// restore `overflow` independently, which could leave the body permanently
// locked (page stuck). With a shared counter, styles are captured on the
// first lock and restored only when the last lock releases.
let lockCount = 0;
let originalOverflow = "";
let originalPaddingRight = "";

export function useLockedBody(locked: boolean = false) {
  useIsomorphicLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (!locked) return;

    if (lockCount === 0) {
      originalOverflow = document.body.style.overflow;
      originalPaddingRight = document.body.style.paddingRight;

      // Measure scrollbar width to prevent layout shift
      const scrollBarWidth =
        window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = "hidden";
      if (scrollBarWidth > 0) {
        document.body.style.paddingRight = `${scrollBarWidth}px`;
      }
    }

    lockCount += 1;

    return () => {
      lockCount -= 1;

      if (lockCount === 0) {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      }
    };
  }, [locked]);
}
