"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Sparkles, Square, Trash2, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useLockedBody } from "@/hooks/use-locked-body";
import type { PermissionKey } from "@/types";
import type { AdminAssistantContextHint } from "@/lib/admin-assistant/prompt";
import { AdminAssistantMessage } from "./admin-assistant-message";

// ---------------------------------------------------------------------------
// Solenne admin assistant — right-side drawer.
//
// Loaded lazily from components/admin/admin-shell.tsx (dynamic import), so the
// storefront and the rest of the admin bundle never pay for @ai-sdk/react.
//
// SECURITY: this component is presentation only. It receives the actor's
// permission set to decide which suggestion chips make sense, but the server
// builds the real tool list from the verified session and re-checks every
// permission inside execute(). Hiding or showing a chip authorizes nothing.
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

type FailureKind =
  | "unauthenticated"
  | "forbidden"
  | "rate_limit"
  | "too_long"
  | "invalid"
  | "error";

class AssistantRequestError extends Error {
  constructor(readonly status: number) {
    super(`Admin assistant request failed with status ${status}.`);
    this.name = "AssistantRequestError";
  }
}

function failureForStatus(status: number): FailureKind {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limit";
  if (status === 413) return "too_long";
  if (status === 400) return "invalid";
  return "error";
}

function deriveContext(pathname: string | null): AdminAssistantContextHint {
  const path = pathname ?? "/admin";
  const segments = path.split("/").filter(Boolean);

  if (segments[0] !== "admin") return { path };

  const section = segments[1];
  const ref = segments[2];

  const type =
    section === "orders"
      ? "order"
      : section === "products"
        ? "product"
        : section === "customers"
          ? "customer"
          : null;

  if (type && ref && /^[A-Za-z0-9-]+$/.test(ref)) {
    return { path, entity: { type, ref } };
  }

  return { path };
}

function pageLabel(pathname: string | null, isVi: boolean): string {
  const path = pathname ?? "/admin";
  const segments = path.split("/").filter(Boolean);

  if (segments[1] === "orders") return isVi ? "Đơn hàng" : "Orders";
  if (segments[1] === "products") return isVi ? "Sản phẩm" : "Products";
  if (segments[1] === "inventory") return isVi ? "Tồn kho" : "Inventory";
  if (segments[1] === "customers") return isVi ? "Khách hàng" : "Customers";
  if (segments[1] === "audit") return isVi ? "Nhật ký" : "Audit log";
  return isVi ? "Tổng quan" : "Dashboard";
}

interface Suggestion {
  id: string;
  label: string;
  prompt: string;
}

export interface AdminAssistantProps {
  locale: string;
  permissions: PermissionKey[];
}

export function AdminAssistant({ locale, permissions }: AdminAssistantProps) {
  const isVi = locale === "vi";
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [failure, setFailure] = useState<FailureKind>("error");

  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wasOpenedRef = useRef(false);

  useLockedBody(isOpen);

  const context = useMemo(() => deriveContext(pathname), [pathname]);
  const contextLabel = pageLabel(pathname, isVi);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/admin-assistant",
        fetch: async (input_, init) => {
          const response = await fetch(input_, init);

          if (!response.ok) {
            if (response.body) await response.body.cancel().catch(() => {});
            throw new AssistantRequestError(response.status);
          }

          return response;
        },
      }),
    []
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
    onError: (chatError) => {
      if (chatError instanceof AssistantRequestError) {
        setFailure(failureForStatus(chatError.status));
        return;
      }
      setFailure("error");
    },
  });

  const isBusy = status === "submitted" || status === "streaming";
  const hasConversation = messages.length > 0;

  // Open with Ctrl/Cmd+J from anywhere in the admin area.
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "j") return;

      event.preventDefault();
      setIsOpen((open) => !open);
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  // Focus management + focus trap + Escape.
  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Return focus to the launcher, but never steal it on first mount.
  useEffect(() => {
    if (isOpen) {
      wasOpenedRef.current = true;
      return;
    }

    if (wasOpenedRef.current) {
      wasOpenedRef.current = false;
      launcherRef.current?.focus();
    }
  }, [isOpen]);

  // Keep the newest turn in view while the answer streams in.
  useEffect(() => {
    if (!isOpen) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, status, isOpen]);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isBusy) return;

      setFailure("error");
      sendMessage({ text: trimmed }, { body: { context, locale } });
      setInput("");
    },
    [context, isBusy, locale, sendMessage]
  );

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit(input);
  };

  const handleComposerKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(input);
    }
  };

  const clearConversation = () => {
    if (isBusy) stop();
    setMessages([]);
    setInput("");
    setFailure("error");
    inputRef.current?.focus();
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    const list: Suggestion[] = [];

    if (permissions.includes("order.read")) {
      if (context.entity?.type === "order") {
        list.push({
          id: "summarize-order",
          label: isVi ? "Tóm tắt đơn này" : "Summarize this order",
          prompt: isVi
            ? `Tóm tắt đơn có id ${context.entity.ref}. Trước tiên gọi findOrder với id đó, sau đó gọi getOrderDetail bằng mã đơn trả về.`
            : `Summarize the order with id ${context.entity.ref}. First call findOrder with that id, then getOrderDetail with the returned order number.`,
        });
      }

      list.push({
        id: "daily-brief",
        label: isVi ? "Tóm tắt hôm nay" : "Daily brief",
        prompt: isVi
          ? "Cho tôi tóm tắt vận hành hôm nay: gọi getOrderSummary với range today, listOrders với status pending, và listLowStock."
          : "Give me today's operations brief: call getOrderSummary with range today, listOrders with status pending, and listLowStock.",
      });

      list.push({
        id: "pending-payments",
        label: isVi ? "Đơn chờ thanh toán" : "Pending payments",
        prompt: isVi
          ? "Liệt kê các đơn pending cũ hơn 2 ngày bằng listOrders với status pending và olderThanDays 2."
          : "List pending orders older than 2 days using listOrders with status pending and olderThanDays 2.",
      });
    }

    if (permissions.includes("inventory.read")) {
      list.push({
        id: "low-stock",
        label: isVi ? "Hàng sắp hết" : "Low stock",
        prompt: isVi
          ? "Biến thể nào sắp hết hoặc đã hết hàng? Dùng listLowStock."
          : "Which product variants are low or out of stock? Use listLowStock.",
      });
    }

    if (permissions.includes("customer.read")) {
      list.push({
        id: "metrics",
        label: isVi ? "Chỉ số tổng quan" : "Dashboard metrics",
        prompt: isVi
          ? "Cho tôi các chỉ số tổng quan về đơn hàng, khách hàng và tồn kho bằng getDashboardMetrics."
          : "Show the headline order, customer and inventory metrics using getDashboardMetrics.",
      });
    }

    return list.slice(0, 4);
  }, [context.entity, isVi, permissions]);

  const failureMessage = (() => {
    switch (failure) {
      case "unauthenticated":
        return isVi
          ? "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại để dùng trợ lý."
          : "Your session has ended. Sign in again to use the assistant.";
      case "forbidden":
        return isVi
          ? "Vai trò của bạn không được phép dùng trợ lý quản trị."
          : "Your role does not have access to the admin assistant.";
      case "rate_limit":
        return isVi
          ? "Bạn đã gửi quá nhiều yêu cầu. Vui lòng đợi một phút rồi thử lại."
          : "Too many requests. Please wait a minute and try again.";
      case "too_long":
        return isVi
          ? "Cuộc trò chuyện quá dài. Hãy xóa cuộc trò chuyện để tiếp tục."
          : "This conversation is too long. Clear it to continue.";
      case "invalid":
        return isVi
          ? "Yêu cầu không đọc được. Vui lòng thử lại."
          : "That request could not be read. Please try again.";
      default:
        return isVi
          ? "Trợ lý tạm thời không khả dụng. Vui lòng thử lại."
          : "The assistant is unavailable right now.";
    }
  })();

  const showFailure = Boolean(error) || failure !== "error";

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={isVi ? "Mở trợ lý quản trị" : "Open admin assistant"}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="admin-assistant-panel"
        title={
          isVi
            ? "Trợ lý quản trị (Ctrl/Cmd + J)"
            : "Admin assistant (Ctrl/Cmd + J)"
        }
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-amber/60 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {isOpen ? (
          <div className="fixed inset-0 z-[75]">
            <motion.button
              type="button"
              aria-label={isVi ? "Đóng trợ lý" : "Close assistant"}
              onClick={() => setIsOpen(false)}
              data-focus-plain
              className="absolute inset-0 h-full w-full cursor-default bg-black/45 backdrop-blur-[1px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            />

            <motion.div
              id="admin-assistant-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-assistant-title"
              tabIndex={-1}
              className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-border bg-card shadow-[-24px_0_80px_-32px_rgba(26,26,26,0.55)] outline-none sm:w-[420px]"
              initial={
                prefersReducedMotion ? { opacity: 0 } : { x: "100%" }
              }
              animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { x: "100%" }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.26,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5">
                <div className="min-w-0">
                  <p className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    <span className="h-1 w-1 rounded-full bg-amber" aria-hidden />
                    {isVi ? "Solenne · Vận hành" : "Solenne · Operations"}
                  </p>
                  <h2
                    id="admin-assistant-title"
                    className="truncate font-serif text-lg font-normal text-foreground"
                  >
                    {isVi ? "Trợ lý quản trị" : "Admin assistant"}
                  </h2>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={clearConversation}
                    disabled={!hasConversation}
                    aria-label={
                      isVi ? "Xóa cuộc trò chuyện" : "Clear conversation"
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>

                  <button
                    ref={closeRef}
                    type="button"
                    onClick={() => setIsOpen(false)}
                    aria-label={isVi ? "Đóng trợ lý" : "Close assistant"}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </header>

              <div className="flex items-center gap-2 border-b border-border/70 px-4 py-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden />
                  {contextLabel}
                </span>
                {context.entity ? (
                  <span className="truncate rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                    {context.entity.type} ·{" "}
                    {context.entity.ref.length > 10
                      ? `${context.entity.ref.slice(0, 8)}…`
                      : context.entity.ref}
                  </span>
                ) : null}
              </div>

              <div
                ref={scrollRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
              >
                {messages.length === 0 ? (
                  <div className="space-y-4">
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      {isVi
                        ? "Tôi đọc được đơn hàng, tồn kho và khách hàng để trả lời câu hỏi vận hành. Giai đoạn này tôi chỉ đọc — không thể hủy đơn, đổi trạng thái hay chỉnh tồn kho."
                        : "I can read orders, stock and customer records to answer operations questions. This phase is read-only — I cannot cancel orders, change statuses or adjust stock."}
                    </p>

                    {suggestions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {suggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            type="button"
                            onClick={() => submit(suggestion.prompt)}
                            className="rounded-full border border-border px-3 py-1.5 text-[11.5px] text-foreground transition-colors hover:border-amber/60 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70"
                          >
                            {suggestion.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">
                        {isVi
                          ? "Vai trò của bạn chưa có quyền đọc dữ liệu vận hành."
                          : "Your role does not have any operational data permissions yet."}
                      </p>
                    )}
                  </div>
                ) : (
                  messages.map((message, index) => (
                    <AdminAssistantMessage
                      key={message.id || `${message.role}-${index}`}
                      message={message}
                      locale={locale}
                      isStreaming={
                        isBusy && index === messages.length - 1
                      }
                    />
                  ))
                )}

                {status === "submitted" ? (
                  <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <span className="sr-only">
                      {isVi ? "Trợ lý đang trả lời" : "Assistant is replying"}
                    </span>
                    {[0, 1, 2].map((dot) => (
                      <motion.span
                        key={dot}
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
                        animate={
                          prefersReducedMotion
                            ? undefined
                            : { opacity: [0.25, 1, 0.25] }
                        }
                        transition={
                          prefersReducedMotion
                            ? undefined
                            : {
                                duration: 1.2,
                                repeat: Infinity,
                                delay: dot * 0.16,
                              }
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              {showFailure ? (
                <div
                  role="alert"
                  className="border-t border-destructive/30 bg-destructive/5 px-4 py-2 text-[12px] leading-snug text-destructive"
                >
                  {failureMessage}
                </div>
              ) : null}

              <form
                onSubmit={handleSubmit}
                className="border-t border-border px-3 py-3"
              >
                <label htmlFor="admin-assistant-input" className="sr-only">
                  {isVi ? "Câu hỏi cho trợ lý" : "Question for the assistant"}
                </label>

                <div className="flex items-end gap-2">
                  <textarea
                    id="admin-assistant-input"
                    ref={inputRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    rows={1}
                    maxLength={2000}
                    placeholder={
                      isVi
                        ? "Hỏi về đơn hàng, tồn kho, khách hàng…"
                        : "Ask about orders, stock or customers…"
                    }
                    className="max-h-32 min-h-[38px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60"
                  />

                  {isBusy ? (
                    <button
                      type="button"
                      onClick={() => stop()}
                      aria-label={isVi ? "Dừng trả lời" : "Stop response"}
                      className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70"
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={input.trim().length === 0}
                      aria-label={isVi ? "Gửi câu hỏi" : "Send message"}
                      className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-foreground text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-40"
                    >
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                  <span>
                    {isVi
                      ? "Chỉ đọc · không thể thay đổi dữ liệu"
                      : "Read-only · cannot change data"}
                  </span>
                  <span className="hidden sm:inline">Ctrl/Cmd + J</span>
                </div>
              </form>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
