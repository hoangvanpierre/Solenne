"use client";

import { PenLine } from "lucide-react";
import { Button } from "@/components/ui";
import { defaultReplyLanguage } from "@/lib/admin-assistant/drafting";
import { openAdminAssistantDraft } from "@/lib/admin-assistant/drawer-events";

// ---------------------------------------------------------------------------
// "Draft a reply" on the admin order page.
//
// Presentation only: it dispatches a window event the assistant drawer listens
// for, passing the order number and a default reply language derived from the
// shipping country. The drawer then asks the model to call getOrderDetail and
// draft from the tool result — this button never fetches, sends or stores
// anything, and the page that renders it already required order.read.
// ---------------------------------------------------------------------------

export interface OrderDraftReplyButtonProps {
  orderNumber: string;
  /** Shipping country, used only to pick the default reply language. */
  country?: string | null;
  locale: string;
}

export function OrderDraftReplyButton({
  orderNumber,
  country,
  locale,
}: OrderDraftReplyButtonProps) {
  const isVi = locale === "vi";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        openAdminAssistantDraft({
          orderNumber,
          language: defaultReplyLanguage(country),
        })
      }
      className="w-full"
    >
      <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
      {isVi ? "Soạn thư trả lời" : "Draft a reply"}
    </Button>
  );
}
