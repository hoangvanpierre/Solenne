import { Circle, Clock, History, TriangleAlert, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isBackfillEvent,
  sortOrderStatusEvents,
} from "@/lib/order-status-events-core";
import type { OrderStatus, OrderStatusEvent } from "@/types";
import { OrderStatusBadge } from "./status-badge";

export interface OrderTimelineProps {
  events: OrderStatusEvent[];
  locale?: string;
  variant?: "customer" | "admin";
  currentStatus?: OrderStatus;
  error?: boolean;
  /** Migration 0017 is not present yet: neutral, non-error degradation. */
  unavailable?: boolean;
  className?: string;
}

const SOURCE_LABELS = {
  creation: { en: "Order placed", vi: "Đơn hàng được tạo" },
  transition: { en: "Status updated", vi: "Cập nhật trạng thái" },
  cancellation: { en: "Order cancelled", vi: "Đơn hàng đã hủy" },
  backfill: {
    en: "Status recorded when order history was enabled",
    vi: "Trạng thái được ghi nhận khi bật lịch sử đơn hàng",
  },
} as const;

function formatTimestamp(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale === "vi" ? "vi-VN" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorLabel(event: OrderStatusEvent, isVi: boolean): string {
  if (event.actorName) return event.actorName;
  if (event.actorUserId) {
    return `${isVi ? "Người dùng" : "User"} ${event.actorUserId.slice(0, 8)}`;
  }
  return isVi ? "Hệ thống / nhập lịch sử" : "System / backfill";
}

/**
 * Read-only status history for an order. The same component serves the
 * customer receipt (own order only) and the management detail page; the
 * `admin` variant additionally reveals previous status, actor and reason.
 */
export function OrderTimeline({
  events,
  locale = "en",
  variant = "customer",
  currentStatus,
  error = false,
  unavailable = false,
  className,
}: OrderTimelineProps) {
  const isVi = locale === "vi";
  const isAdmin = variant === "admin";
  const ordered = sortOrderStatusEvents(events);

  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-6",
        className
      )}
      aria-labelledby="order-timeline-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-start gap-2">
          <History
            className="mt-0.5 h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <div>
            <h2
              id="order-timeline-title"
              className="font-serif text-lg font-normal leading-[1.3] text-foreground"
            >
              {isVi ? "Dòng thời gian đơn hàng" : "Order timeline"}
            </h2>
            <p className="mt-1 text-xs font-normal leading-relaxed text-muted-foreground">
              {isVi
                ? "Các trạng thái đơn hàng đã được ghi nhận, từ cũ đến mới."
                : "Recorded order statuses, oldest first."}
            </p>
          </div>
        </div>
        {currentStatus && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">
              {isVi ? "Hiện tại" : "Current"}
            </span>
            <OrderStatusBadge status={currentStatus} locale={locale} />
          </div>
        )}
      </div>

      {unavailable ? (
        <div
          role="status"
          className="mt-5 flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground"
        >
          <Clock
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-normal leading-relaxed">
            {isVi
              ? "Lịch sử trạng thái chưa khả dụng. Trạng thái hiện tại của đơn hàng vẫn được hiển thị ở trên."
              : "Order history isn't available yet. The order's current status is still shown above."}
          </p>
        </div>
      ) : error ? (
        <div
          role="status"
          className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground"
        >
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <p className="font-normal leading-relaxed">
            {isVi
              ? "Không thể tải lịch sử trạng thái lúc này. Trạng thái hiện tại của đơn hàng vẫn được hiển thị."
              : "We couldn't load the status history right now. The order's current status is still shown above."}
          </p>
        </div>
      ) : ordered.length === 0 ? (
        <div
          role="status"
          className="mt-5 flex items-start gap-2 rounded-xl border border-border/70 p-4 text-sm text-muted-foreground"
        >
          <Clock
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-normal leading-relaxed">
            {isVi
              ? "Chưa có sự kiện trạng thái nào được ghi nhận cho đơn hàng này."
              : "No status events have been recorded for this order yet."}
          </p>
        </div>
      ) : (
        <ol className="mt-6 space-y-6">
          {ordered.map((event, index) => {
            const isLast = index === ordered.length - 1;
            const isBackfill = isBackfillEvent(event);
            const sourceLabel =
              SOURCE_LABELS[event.source]?.[isVi ? "vi" : "en"] ??
              SOURCE_LABELS.transition[isVi ? "vi" : "en"];

            return (
              <li
                key={event.id}
                className="relative pl-8"
                aria-current={isLast ? "step" : undefined}
              >
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[7px] top-5 bottom-[-1.5rem] w-px bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border",
                    isLast
                      ? "border-amber/40 bg-amber/20 text-amber"
                      : isBackfill
                        ? "border-border bg-muted text-muted-foreground"
                        : "border-sage/40 bg-sage/15 text-sage"
                  )}
                >
                  <Circle className="h-1.5 w-1.5 fill-current" />
                </span>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <OrderStatusBadge status={event.toStatus} locale={locale} />
                  {isLast && (
                    <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">
                      {isVi ? "Hiện tại" : "Current"}
                    </span>
                  )}
                  <span className="text-[11.5px] font-normal text-muted-foreground">
                    {sourceLabel}
                  </span>
                </div>

                {isAdmin && event.fromStatus && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-normal text-muted-foreground">
                    <span>{isVi ? "Từ" : "From"}</span>
                    <OrderStatusBadge
                      status={event.fromStatus}
                      locale={locale}
                      className="px-2 py-0 text-[10px]"
                    />
                    <span aria-hidden="true">→</span>
                    <OrderStatusBadge
                      status={event.toStatus}
                      locale={locale}
                      className="px-2 py-0 text-[10px]"
                    />
                  </div>
                )}

                <time
                  dateTime={event.createdAt}
                  className="mt-2 block text-[11.5px] font-normal tabular-nums text-muted-foreground"
                >
                  {formatTimestamp(event.createdAt, locale)}
                </time>

                {isAdmin && (
                  <dl className="mt-2 space-y-1 text-[12px] font-normal">
                    <div className="flex flex-wrap gap-x-2">
                      <dt className="text-muted-foreground">
                        {isVi ? "Người thực hiện:" : "Actor:"}
                      </dt>
                      <dd className="text-foreground">
                        {actorLabel(event, isVi)}
                      </dd>
                    </div>
                    {event.reason && (
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="text-muted-foreground">
                          {isVi ? "Lý do:" : "Reason:"}
                        </dt>
                        <dd className="whitespace-pre-wrap text-foreground">
                          {event.reason}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}

                {event.trackingCode && (
                  <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 text-[11.5px] font-normal text-muted-foreground">
                    <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isVi ? "Mã vận đơn:" : "Tracking:"}</span>
                    <span className="select-all tabular-nums text-foreground">
                      {event.trackingCode}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
