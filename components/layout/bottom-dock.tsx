"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { BackToTop } from "@/components/ui/back-to-top";
import { cn } from "@/lib/utils";

const ChatWidget = dynamic(
  () =>
    import("@/components/assistant/chat-widget").then((mod) => mod.ChatWidget),
  { ssr: false }
);

/**
 * Bottom-right floating dock: a vertical stack with the chat launcher above
 * the back-to-top button.
 *
 * Coordinates two concerns:
 *  1. The back-to-top slot smoothly grows/shrinks as the button appears.
 *  2. While the chat panel is open the slot is "frozen" at its full height so
 *     the launcher (and the panel above it) never shift when scrolling toggles
 *     the back-to-top visibility.
 *
 * Geometry is driven by `--dock-*` tokens in `app/globals.css`.
 */
export function BottomDock() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [bttVisible, setBttVisible] = useState(false);

  const handleOpenChange = useCallback((open: boolean) => {
    setPanelOpen(open);
  }, []);

  const handleVisibilityChange = useCallback((visible: boolean) => {
    setBttVisible(visible);
  }, []);

  // While the panel is open we reserve the full back-to-top slot height so
  // the launcher cannot shift. Outside of that, the slot reflects the actual
  // button visibility so the launcher glides smoothly up/down.
  const slotExpanded = panelOpen || bttVisible;

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col items-center",
        "bottom-[var(--dock-offset-y)] right-[var(--dock-offset-x)]"
      )}
    >
      {/* Launcher wrapper — the panel is positioned absolutely from here. */}
      <div className="relative">
        <ChatWidget onOpenChange={handleOpenChange} />
      </div>

      {/* Back-to-top slot: height is animated via max-height + margin so the
          launcher glides. `overflow-visible` keeps the tooltip readable. */}
      <div
        className={cn(
          "dock-btt-slot overflow-visible",
          slotExpanded && "dock-btt-slot--expanded"
        )}
      >
        <BackToTop onVisibilityChange={handleVisibilityChange} />
      </div>
    </div>
  );
}
