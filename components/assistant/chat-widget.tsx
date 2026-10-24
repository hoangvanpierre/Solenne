"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send, X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { useAppLocale } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";

/** Why the last request failed, so the panel can pick the right copy. */
type FailureKind = "rate_limit" | "too_long" | "error";

/**
 * The transport throws away the HTTP status, so tag the two cases the panel
 * needs to explain differently: a throttled visitor and an over-long chat.
 */
class ChatRequestError extends Error {
  constructor(readonly status: number) {
    super(`Chat request failed with status ${status}.`);
    this.name = "ChatRequestError";
  }
}

export interface ChatWidgetProps {
  /** Called whenever the panel opens or closes. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Customer-facing scent concierge.
 *
 * Mounted once in the marketing layout. Chat history lives in memory only —
 * nothing is persisted, so a reload starts a fresh conversation.
 * The panel deliberately hides itself on checkout, where a conversation would
 * compete with the order flow.
 */
export function ChatWidget({ onOpenChange }: ChatWidgetProps) {
  const t = useTranslations("assistant");
  const locale = useAppLocale();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [failure, setFailure] = useState<FailureKind>("error");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input_, init) => {
          const response = await fetch(input_, init);

          // Keep the status, which the default transport discards.
          if (response.status === 429 || response.status === 413) {
            if (response.body) await response.body.cancel().catch(() => {});
            throw new ChatRequestError(response.status);
          }

          return response;
        },
      }),
    []
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError: (chatError) => {
      if (chatError instanceof ChatRequestError) {
        setFailure(chatError.status === 429 ? "rate_limit" : "too_long");
        return;
      }

      setFailure("error");
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  // Notify parent when the panel opens or closes.
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, status, isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // The (marketing) layout also wraps checkout; the concierge stays out of it.
  if (pathname?.startsWith("/checkout")) return null;

  const suggestions = [
    t("suggestion1"),
    t("suggestion2"),
    t("suggestion3"),
  ];

  const failureMessage =
    failure === "rate_limit"
      ? t("rateLimit")
      : failure === "too_long"
        ? t("tooLong")
        : t("error");

  const submitMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;

    setFailure("error");
    sendMessage({ text: trimmed }, { body: { locale } });
    setInput("");
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage(input);
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-modal="false"
            aria-label={t("title")}
            className={cn(
              "absolute z-50 flex flex-col overflow-hidden",
              // Anchored above the launcher, right edge aligned.
              "right-0 bottom-[var(--dock-panel-anchor)]",
              "w-[var(--dock-panel-width)] min-[480px]:w-[23.5rem]",
              "max-h-[var(--dock-panel-max-height)]",
              "rounded-[1.75rem] border border-border bg-card/98 backdrop-blur-xl",
              "shadow-[0_28px_80px_-24px_rgba(26,26,26,0.5)]"
            )}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4">
              <div className="min-w-0">
                <p className="mb-1 flex items-center gap-2 text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
                  <span className="h-1 w-1 rounded-full bg-amber" aria-hidden />
                  {t("eyebrow")}
                </p>
                <h2 className="truncate font-serif text-lg font-normal tracking-[0.01em] text-foreground">
                  {t("title")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={t("close")}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  "border border-border text-muted-foreground",
                  "transition-colors duration-200 hover:border-amber/60 hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50"
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Conversation */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5"
            >
              {messages.length === 0 ? (
                <div className="space-y-5">
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                    {t("greeting")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => submitMessage(suggestion)}
                        className={cn(
                          "rounded-full border border-border px-3.5 py-1.5",
                          "text-[11.5px] font-normal text-foreground",
                          "transition-colors duration-200 hover:border-amber/60 hover:bg-muted/60",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50"
                        )}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => {
                  const text = message.parts
                    .map((part) => (part.type === "text" ? part.text : ""))
                    .filter(Boolean)
                    .join("\n")
                    .trim();

                  if (!text) return null;

                  const isUser = message.role === "user";

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex flex-col gap-1.5",
                        isUser ? "items-end" : "items-start"
                      )}
                    >
                      <span className="text-[10px] font-normal uppercase tracking-[0.16em] text-muted-foreground">
                        {isUser ? t("you") : t("assistantName")}
                      </span>
                      <div
                        className={cn(
                          "max-w-[88%] whitespace-pre-wrap text-[13.5px] leading-relaxed",
                          isUser
                            ? "rounded-2xl rounded-br-md bg-warm-black px-4 py-2.5 text-cream"
                            : "text-foreground"
                        )}
                      >
                        {text}
                      </div>
                    </div>
                  );
                })
              )}

              {status === "submitted" && (
                <div
                  className="flex items-center gap-2 pt-1"
                  aria-live="polite"
                >
                  <span className="flex items-center gap-1" aria-hidden>
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 rounded-full bg-amber/70 animate-pulse"
                        style={{ animationDelay: `${dot * 160}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {t("typing")}
                  </span>
                </div>
              )}

              {error && (
                <p
                  role="status"
                  className="text-[11.5px] leading-relaxed text-destructive"
                >
                  {failureMessage}
                </p>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-border/70 bg-background/40 px-3.5 py-3"
            >
              <div
                className={cn(
                  "assistant-composer flex items-center gap-2 rounded-full border border-border",
                  "bg-background/80 px-4 py-1.5 transition-shadow duration-200",
                  "focus-within:border-amber/60 focus-within:ring-2 focus-within:ring-amber/25"
                )}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={500}
                  disabled={isBusy}
                  placeholder={t("placeholder")}
                  aria-label={t("placeholder")}
                  className={cn(
                    "h-9 min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground",
                    "outline-none placeholder:text-muted-foreground",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                />
                <button
                  type="submit"
                  disabled={isBusy || input.trim().length === 0}
                  aria-label={t("send")}
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    "bg-warm-black text-cream transition-opacity duration-200",
                    "hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50"
                  )}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 px-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
                {t("disclaimer")}
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher — the dock's corner anchor (app/(marketing)/layout.tsx). */}
      <motion.button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={t("launcher")}
        aria-expanded={isOpen}
        initial={{ opacity: 0, y: 16, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -2, scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "flex h-[var(--dock-launcher-size)] w-[var(--dock-launcher-size)] items-center justify-center rounded-full",
          "border border-amber/40 bg-warm-black text-cream",
          "shadow-[0_14px_38px_-12px_rgba(26,26,26,0.55)]",
          "transition-colors duration-300 hover:border-amber hover:bg-amber hover:text-warm-black",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/50"
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isOpen ? "close" : "chat"}
            initial={{ opacity: 0, rotate: -25, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 25, scale: 0.7 }}
            transition={{ duration: 0.18 }}
            className="flex items-center justify-center"
          >
            {isOpen ? (
              <X className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.75} />
            ) : (
              <MessageCircle
                className="h-4 w-4 sm:h-5 sm:w-5"
                strokeWidth={1.5}
              />
            )}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </>
  );
}
