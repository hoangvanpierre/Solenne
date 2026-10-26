"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UIMessage } from "ai";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  Mail,
  PackageCheck,
  RefreshCw,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_CATALOGUE, type AdminAssistantToolName } from "@/lib/admin-assistant/access";
import { buildDataUsedTables } from "@/lib/admin-assistant/presentation";
import {
  isProposalStale,
  proposalAgeMs,
  type AssistantProposal,
} from "@/lib/admin-assistant/proposals";
import {
  buildMailtoUrl,
  findPlaceholders,
} from "@/lib/admin-assistant/drafting";
import { cancelOrderAction, transitionOrderStatusAction } from "@/app/actions/orders";
import { adjustInventoryAction } from "@/app/actions/inventory";

// ---------------------------------------------------------------------------
// One chat turn in the admin assistant drawer.
//
// Assistant answers can be grounded in several tool calls. Each completed call
// is shown in a collapsible "Data used" block with the tool name, the validated
// arguments, the number of rows returned AND a compact read-only table of the
// rows themselves. The table is built from the exact tool output the model
// received (lib/admin-assistant/presentation.ts), so an operator can check a
// figure without trusting the model's prose. Money is quoted verbatim from the
// tool's pre-formatted string — the UI never formats or converts it.
//
// Tool parts arrive from the AI SDK UI stream as `tool-<name>` parts with
// `state: "output-available"` once execute() resolved. In-flight parts show a
// quiet "Checking…" row instead.
// ---------------------------------------------------------------------------

interface ToolPartLike {
  type: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  toolName?: string;
  errorText?: string;
}

export interface AdminAssistantMessageProps {
  message: UIMessage;
  locale: string;
  isStreaming: boolean;
  /**
   * Ask the assistant for a fresh proposal for the same target. Wired to the
   * drawer's composer so a stale card can be replaced without leaving the chat.
   */
  onRefreshProposal?: (proposal: AssistantProposal) => void;
}

function toolPartsOf(message: UIMessage): ToolPartLike[] {
  return message.parts.filter(
    (part) => part.type === "dynamic-tool" || part.type.startsWith("tool-")
  ) as unknown as ToolPartLike[];
}

function textOf(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function toolNameOf(part: ToolPartLike): string {
  if (typeof part.toolName === "string" && part.toolName) return part.toolName;
  return part.type.startsWith("tool-") ? part.type.slice(5) : part.type;
}

function toolLabel(name: string, isVi: boolean): string {
  const entry = TOOL_CATALOGUE[name as AdminAssistantToolName];
  if (!entry) return name;
  const labels: Record<AdminAssistantToolName, { en: string; vi: string }> = {
    getOrderSummary: { en: "Order summary", vi: "Tổng quan đơn hàng" },
    listOrders: { en: "Order list", vi: "Danh sách đơn" },
    findOrder: { en: "Order search", vi: "Tìm đơn" },
    getOrderDetail: { en: "Order detail", vi: "Chi tiết đơn" },
    listLowStock: { en: "Low stock", vi: "Hàng sắp hết" },
    getProductStock: { en: "Product stock", vi: "Tồn kho sản phẩm" },
    findCustomer: { en: "Customer search", vi: "Tìm khách hàng" },
    getDashboardMetrics: { en: "Dashboard metrics", vi: "Chỉ số tổng quan" },
    draftCustomerEmail: { en: "Draft reply", vi: "Bản nháp thư" },
    proposeCancelOrder: { en: "Cancel proposal", vi: "Đề xuất hủy đơn" },
    proposeFulfillmentTransition: {
      en: "Fulfillment proposal",
      vi: "Đề xuất chuyển trạng thái",
    },
    proposeInventoryAdjustment: {
      en: "Stock proposal",
      vi: "Đề xuất điều chỉnh tồn kho",
    },
  };
  const label = labels[name as AdminAssistantToolName];
  return label ? (isVi ? label.vi : label.en) : entry.label;
}

function formatArgs(input: unknown): string {
  if (!input || typeof input !== "object") return "—";

  const entries = Object.entries(input as Record<string, unknown>).filter(
    ([, value]) => value !== undefined && value !== null && value !== ""
  );

  if (entries.length === 0) return "—";

  return entries
    .map(([key, value]) => {
      if (typeof value === "string") return `${key}: ${value}`;
      if (typeof value === "number" || typeof value === "boolean") {
        return `${key}: ${String(value)}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join(", ");
}

function rowCountOf(output: unknown): number | null {
  if (!output || typeof output !== "object") return null;

  const record = output as Record<string, unknown>;

  if (typeof record.returnedCount === "number") return record.returnedCount;
  if (Array.isArray(record.orders)) return record.orders.length;
  if (Array.isArray(record.variants)) return record.variants.length;
  if (Array.isArray(record.customers)) return record.customers.length;
  if (record.found === false) return 0;
  if (record.found === true) return 1;

  return null;
}

/**
 * Compact, read-only table(s) for one tool result. Renders exactly the rows in
 * `output` — the same object the model saw — capped at the tool's own row cap.
 */
function DataUsedTables({
  name,
  output,
  isVi,
}: {
  name: string;
  output: unknown;
  isVi: boolean;
}) {
  const tables = buildDataUsedTables(name, output, isVi ? "vi" : "en");

  if (tables.length === 0) return null;

  return (
    <div className="mt-1.5 space-y-2">
      {tables.map((table, tableIndex) => (
        <div key={`${table.caption}-${tableIndex}`}>
          {table.rows.length === 0 ? (
            <>
              <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {table.caption}
              </p>
              <p className="text-[10.5px] text-muted-foreground">
                {isVi ? "Không có dòng nào." : "No rows returned."}
              </p>
            </>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border/60">
              <table className="w-full border-collapse text-left text-[10.5px]">
                <caption className="px-1.5 py-1 text-left text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {table.caption}
                </caption>
                <thead>
                  <tr className="bg-muted/40">
                    {table.columns.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        className={cn(
                          "whitespace-nowrap px-1.5 py-1 font-medium text-muted-foreground",
                          column.align === "right" && "text-right"
                        )}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className="border-t border-border/50 align-top"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={cn(
                            "px-1.5 py-1 text-foreground",
                            table.columns[cellIndex]?.align === "right"
                              ? "whitespace-nowrap text-right tabular-nums"
                              : "break-words"
                          )}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {table.note ? (
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {table.note}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

interface DraftValue {
  language: string;
  subject: string;
  body: string;
}

function draftValueOf(part: ToolPartLike): DraftValue | null {
  if (part.state !== "output-available") return null;
  const output = part.output;
  if (!output || typeof output !== "object") return null;

  const record = output as Record<string, unknown>;
  if (typeof record.subject !== "string" || typeof record.body !== "string") {
    return null;
  }

  return {
    language: typeof record.language === "string" ? record.language : "en",
    subject: record.subject,
    body: record.body,
  };
}

function CopyButton({
  value,
  label,
  isVi,
}: {
  value: string;
  label: string;
  isVi: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — the text stays selectable on screen.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60"
    >
      {copied ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      {copied ? (isVi ? "Đã chép" : "Copied") : label}
    </button>
  );
}

/**
 * A customer reply the assistant wrote. Editable in place, copyable field by
 * field, and openable in the operator's own mail client. Nothing here sends or
 * saves: the mailto link is a plain anchor and the draft lives only in this
 * component's state.
 */
function DraftCard({ draft, isVi }: { draft: DraftValue; isVi: boolean }) {
  const fieldId = useId();
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);

  const mailto = buildMailtoUrl({ subject, body });
  const placeholders = findPlaceholders(`${subject}\n${body}`);
  const languageLabel =
    draft.language === "vi"
      ? isVi
        ? "Tiếng Việt"
        : "Vietnamese"
      : isVi
        ? "Tiếng Anh"
        : "English";

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          {isVi ? "Bản nháp thư" : "Draft reply"}
        </span>
        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {languageLabel}
        </span>
      </div>

      <label
        htmlFor={`${fieldId}-subject`}
        className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
      >
        {isVi ? "Tiêu đề" : "Subject"}
      </label>
      <input
        id={`${fieldId}-subject`}
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      />

      <label
        htmlFor={`${fieldId}-body`}
        className="mt-2 block text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
      >
        {isVi ? "Nội dung" : "Body"}
      </label>
      <textarea
        id={`${fieldId}-body`}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={9}
        className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <CopyButton
          value={subject}
          label={isVi ? "Chép tiêu đề" : "Copy subject"}
          isVi={isVi}
        />
        <CopyButton
          value={body}
          label={isVi ? "Chép nội dung" : "Copy body"}
          isVi={isVi}
        />
        <a
          href={mailto.href}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60"
        >
          <Mail className="h-3 w-3" aria-hidden="true" />
          {isVi ? "Mở ứng dụng thư" : "Open in mail app"}
        </a>
      </div>

      {mailto.truncated ? (
        <p className="mt-2 text-[10.5px] leading-snug text-amber-700 dark:text-amber-400">
          {isVi
            ? `Nội dung quá dài cho liên kết thư nên đã được rút gọn (giữ ${mailto.keptCharacters}/${mailto.originalCharacters} ký tự). Hãy dùng nút chép để giữ đầy đủ.`
            : `The body was too long for a mail link, so it was shortened (kept ${mailto.keptCharacters} of ${mailto.originalCharacters} characters). Use the copy button to keep all of it.`}
        </p>
      ) : null}

      {placeholders.length > 0 ? (
        <p className="mt-2 text-[10.5px] leading-snug text-amber-700 dark:text-amber-400">
          {isVi ? "Cần điền trước khi gửi: " : "Fill in before sending: "}
          <span className="font-medium">{placeholders.join(", ")}</span>
        </p>
      ) : null}

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        {isVi
          ? "Đây chỉ là bản nháp. Solenne không gửi hay lưu thư từ khung này."
          : "This is only a draft. Solenne never sends or saves email from this drawer."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase 3 — proposal card.
//
// The assistant can only PROPOSE. This card shows exactly what would change and
// then hands the confirmation to the existing server action, so the same zod
// schema, permission check, atomic RPC and audit row run as in the admin UI.
// Two explicit steps (review → confirm) make the destructive action deliberate;
// a proposal older than five minutes, or one whose target changed, is disabled
// and must be refreshed.
// ---------------------------------------------------------------------------

const PROPOSAL_TYPE_VALUES = [
  "cancel_order",
  "fulfillment_transition",
  "inventory_adjustment",
] as const;

/**
 * The union of the three existing server-action results. The card reads only
 * the fields it displays; every action still returns its own richer shape.
 */
interface ActionOutcome {
  success?: boolean;
  error?: string;
  orderNumber?: string;
  previousStatus?: string;
  newStatus?: string;
  trackingCode?: string | null;
  previousStock?: number;
  newStock?: number;
}

function proposalValueOf(part: ToolPartLike): AssistantProposal | null {
  if (part.state !== "output-available") return null;
  const output = part.output;
  if (!output || typeof output !== "object") return null;

  const record = output as Record<string, unknown>;

  if (record.kind !== "proposal") return null;
  if (
    typeof record.type !== "string" ||
    !(PROPOSAL_TYPE_VALUES as readonly string[]).includes(record.type)
  ) {
    return null;
  }
  if (typeof record.createdAt !== "string") return null;
  if (!record.params || typeof record.params !== "object") return null;

  return output as AssistantProposal;
}

/** The real actions map a changed target to one of these messages. */
function isStateChangedError(message: string): boolean {
  return /already been cancelled|fulfillment status|already in|not permitted|below zero|insufficient stock|not found|no longer exist/i.test(
    message
  );
}

function proposalAgeLabel(
  createdAt: string,
  now: number,
  isVi: boolean
): string {
  const ms = proposalAgeMs(createdAt, new Date(now));
  if (!Number.isFinite(ms)) return isVi ? "không rõ thời điểm" : "unknown age";

  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return isVi ? "vừa xong" : "just now";
  if (minutes === 1) return isVi ? "1 phút trước" : "1 min ago";
  return isVi ? `${minutes} phút trước` : `${minutes} min ago`;
}

function proposalTypeLabel(type: AssistantProposal["type"], isVi: boolean) {
  if (type === "cancel_order") {
    return isVi ? "Đề xuất hủy đơn" : "Cancellation proposal";
  }
  if (type === "fulfillment_transition") {
    return isVi ? "Đề xuất chuyển trạng thái" : "Fulfillment proposal";
  }
  return isVi ? "Đề xuất điều chỉnh tồn kho" : "Stock proposal";
}

function signedDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function ProposalCard({
  proposal,
  isVi,
  onRefresh,
}: {
  proposal: AssistantProposal;
  isVi: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [step, setStep] = useState<"review" | "confirm">("review");
  const [reason, setReason] = useState(proposal.params.reason ?? "");
  const [trackingCode, setTrackingCode] = useState("");
  const [delta, setDelta] = useState(String(proposal.params.delta ?? ""));
  const [now, setNow] = useState(() => Date.now());
  const [forcedStale, setForcedStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const trackingRef = useRef<HTMLInputElement>(null);
  const deltaRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const isRollback =
    proposal.type === "fulfillment_transition" &&
    proposal.params.fromStatus === "shipped" &&
    proposal.params.toStatus === "processing";
  const needsReason =
    proposal.type === "inventory_adjustment" || isRollback;
  const needsTracking =
    proposal.type === "fulfillment_transition" &&
    proposal.params.toStatus === "shipped";

  const blocked = proposal.status === "blocked";
  const stale = forcedStale || isProposalStale(proposal.createdAt, new Date(now));

  // Age + staleness ticker. Fifteen seconds is enough for a five-minute limit.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  // Move focus into the confirmation step so keyboard and screen-reader users
  // land on the first thing they must fill in.
  useEffect(() => {
    if (step !== "confirm") return;
    const first =
      (proposal.type === "inventory_adjustment" ? deltaRef.current : null) ??
      (needsTracking ? trackingRef.current : null) ??
      (needsReason ? reasonRef.current : null) ??
      confirmRef.current;
    first?.focus();
  }, [step, needsReason, needsTracking, proposal.type]);

  const trimmedReason = reason.trim();
  const trimmedTracking = trackingCode.trim();
  const deltaNumber = Number(delta);

  let fieldError: string | null = null;

  if (needsReason) {
    const max = proposal.type === "inventory_adjustment" ? 255 : 500;
    if (trimmedReason.length < 3) {
      fieldError = isVi
        ? "Lý do cần ít nhất 3 ký tự."
        : "A reason of at least 3 characters is required.";
    } else if (trimmedReason.length > max) {
      fieldError = isVi
        ? `Lý do không được vượt quá ${max} ký tự.`
        : `The reason cannot exceed ${max} characters.`;
    }
  }

  if (!fieldError && needsTracking) {
    if (trimmedTracking.length < 3 || trimmedTracking.length > 100) {
      fieldError = isVi
        ? "Mã vận đơn cần 3–100 ký tự."
        : "A tracking code of 3–100 characters is required.";
    }
  }

  if (!fieldError && proposal.type === "inventory_adjustment") {
    if (!Number.isInteger(deltaNumber) || deltaNumber === 0) {
      fieldError = isVi
        ? "Mức điều chỉnh phải là số nguyên khác 0."
        : "The adjustment must be a non-zero whole number.";
    }
  }

  const canConfirm =
    !blocked && !stale && !done && !pending && fieldError === null;

  /**
   * The confirmation message quotes what the ACTION returned, not what the
   * proposal predicted. Stock can move between review and confirm, and the
   * atomic RPC's own numbers are the only ones worth showing.
   */
  const describeSuccess = (result: ActionOutcome): string => {
    if (proposal.type === "cancel_order") {
      const ref = result.orderNumber ?? proposal.targetRef;
      return isVi
        ? `Đã hủy đơn ${ref}. Tồn kho đã được hoàn lại.`
        : `Order ${ref} cancelled. Inventory has been restored.`;
    }
    if (proposal.type === "fulfillment_transition") {
      const to = result.newStatus ?? proposal.params.toStatus ?? "";
      return isVi
        ? `Đã chuyển đơn ${proposal.targetRef} sang ${to}.`
        : `Order ${proposal.targetRef} moved to ${to}.`;
    }
    const newStock = result.newStock ?? proposal.params.newStock;
    return isVi
      ? `Đã điều chỉnh tồn kho${typeof newStock === "number" ? ` thành ${newStock}` : ""}.`
      : `Stock adjusted${typeof newStock === "number" ? ` to ${newStock}` : ""}.`;
  };

  const confirm = () => {
    if (!canConfirm || !proposal.targetId) return;

    setError(null);

    startTransition(async () => {
      let result: ActionOutcome | null = null;

      if (proposal.type === "cancel_order") {
        result = await cancelOrderAction(
          proposal.targetId as string,
          trimmedReason || undefined
        );
      } else if (proposal.type === "fulfillment_transition") {
        if (!proposal.params.toStatus) return;
        result = await transitionOrderStatusAction(
          proposal.targetId as string,
          proposal.params.toStatus,
          needsTracking ? trimmedTracking : undefined,
          trimmedReason || undefined
        );
      } else {
        result = await adjustInventoryAction({
          variantId: proposal.targetId as string,
          delta: deltaNumber,
          reason: trimmedReason,
        });
      }

      if (!result || !result.success) {
        const message =
          result?.error ??
          (isVi ? "Thao tác không thành công." : "The action did not succeed.");
        setError(message);
        // A changed target (already cancelled, already in status, stock moved)
        // invalidates the proposal: mark it stale instead of letting the
        // operator retry a card that no longer matches reality, and refresh the
        // underlying admin page so it shows the same truth.
        if (isStateChangedError(message)) {
          setForcedStale(true);
          router.refresh();
        }
        return;
      }

      setDone(describeSuccess(result));
      router.refresh();
    });
  };

  const rows: [string, string][] = [];

  if (proposal.type === "cancel_order") {
    rows.push([
      isVi ? "Đơn" : "Order",
      proposal.params.orderNumber ?? proposal.targetRef,
    ]);
    rows.push([
      isVi ? "Trạng thái" : "Status",
      proposal.params.fromStatus ?? "—",
    ]);
    rows.push([
      isVi ? "Lý do" : "Reason",
      proposal.params.reason || (isVi ? "không có" : "none"),
    ]);
  } else if (proposal.type === "fulfillment_transition") {
    rows.push([
      isVi ? "Đơn" : "Order",
      proposal.params.orderNumber ?? proposal.targetRef,
    ]);
    rows.push([isVi ? "Từ" : "From", proposal.params.fromStatus ?? "—"]);
    rows.push([isVi ? "Sang" : "To", proposal.params.toStatus ?? "—"]);
  } else {
    rows.push([isVi ? "Phiên bản" : "Variant", proposal.targetLabel]);
    rows.push([
      isVi ? "Tồn hiện tại" : "Current stock",
      typeof proposal.params.previousStock === "number"
        ? String(proposal.params.previousStock)
        : "—",
    ]);
    rows.push([
      isVi ? "Tồn sau" : "Resulting stock",
      typeof proposal.params.newStock === "number"
        ? String(proposal.params.newStock)
        : "—",
    ]);
    rows.push([
      isVi ? "Thay đổi" : "Delta",
      typeof proposal.params.delta === "number"
        ? signedDelta(proposal.params.delta)
        : "—",
    ]);
    rows.push([
      isVi ? "Lý do" : "Reason",
      proposal.params.reason || (isVi ? "chưa có" : "not set"),
    ]);
  }

  const Icon =
    proposal.type === "cancel_order"
      ? Ban
      : proposal.type === "fulfillment_transition"
        ? PackageCheck
        : SlidersHorizontal;

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "rounded-xl border bg-card p-3",
        blocked || stale ? "border-amber/60" : "border-border"
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <span
          id={titleId}
          className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
        >
          {proposalTypeLabel(proposal.type, isVi)}
        </span>
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[10px]",
            blocked
              ? "border-destructive/40 text-destructive"
              : "border-sage/60 text-foreground"
          )}
        >
          {blocked
            ? isVi
              ? "Bị chặn"
              : "Blocked"
            : isVi
              ? "Sẵn sàng"
              : "Ready"}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {proposalAgeLabel(proposal.createdAt, now, isVi)}
        </span>
      </div>

      <p className="text-[12.5px] leading-relaxed text-foreground">
        {proposal.humanSummary}
      </p>

      <dl className="mt-2 space-y-1 text-[11px] leading-snug">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-words text-right text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      {proposal.warnings.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-[10.5px] leading-snug text-amber-700 dark:text-amber-400">
          {proposal.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      {blocked ? (
        <div role="alert" className="mt-2 space-y-0.5 text-[10.5px] leading-snug text-destructive">
          {proposal.blockers.map((blocker) => (
            <p key={blocker}>{blocker}</p>
          ))}
        </div>
      ) : null}

      {stale ? (
        <p
          role="alert"
          className="mt-2 text-[10.5px] leading-snug text-amber-700 dark:text-amber-400"
        >
          {isVi
            ? "Đề xuất này đã cũ hoặc dữ liệu đã thay đổi. Hãy tạo lại đề xuất trước khi xác nhận."
            : "This proposal is old or the target has changed. Prepare a fresh one before confirming."}
        </p>
      ) : null}

      {done ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 text-[11px] leading-snug text-sage"
        >
          {done}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[10.5px] leading-snug text-destructive">
          {error}
        </p>
      ) : null}

      {step === "review" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!blocked && !stale && !done ? (
            <button
              type="button"
              onClick={() => setStep("confirm")}
              className="rounded-md border border-border bg-foreground px-2.5 py-1 text-[11px] text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {isVi ? "Xem lại và xác nhận" : "Review and confirm"}
            </button>
          ) : null}

          {blocked || stale ? (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              {stale
                ? isVi
                  ? "Tạo lại đề xuất"
                  : "Prepare a fresh proposal"
                : isVi
                  ? "Kiểm tra lại trạng thái"
                  : "Re-check state"}
            </button>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          {proposal.type === "inventory_adjustment" ? (
            <div>
              <label
                htmlFor={`${titleId}-delta`}
                className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
              >
                {isVi ? "Mức điều chỉnh" : "Adjustment"}
              </label>
              <input
                id={`${titleId}-delta`}
                ref={deltaRef}
                type="number"
                step={1}
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
              />
            </div>
          ) : null}

          {needsTracking ? (
            <div>
              <label
                htmlFor={`${titleId}-tracking`}
                className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
              >
                {isVi ? "Mã vận đơn" : "Tracking code"}
              </label>
              <input
                id={`${titleId}-tracking`}
                ref={trackingRef}
                value={trackingCode}
                onChange={(event) => setTrackingCode(event.target.value)}
                maxLength={100}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
              />
            </div>
          ) : null}

          {needsReason || proposal.type === "cancel_order" ? (
            <div>
              <label
                htmlFor={`${titleId}-reason`}
                className="block text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
              >
                {needsReason
                  ? isVi
                    ? "Lý do (bắt buộc)"
                    : "Reason (required)"
                  : isVi
                    ? "Lý do (không bắt buộc)"
                    : "Reason (optional)"}
              </label>
              <textarea
                id={`${titleId}-reason`}
                ref={reasonRef}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={2}
                maxLength={proposal.type === "inventory_adjustment" ? 255 : 500}
                className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-[12.5px] leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
              />
            </div>
          ) : null}

          {fieldError ? (
            <p role="alert" className="text-[10.5px] leading-snug text-destructive">
              {fieldError}
            </p>
          ) : null}

          <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-400">
            {isVi
              ? "Xác nhận sẽ thay đổi dữ liệu thật. Màn hình quản trị sẽ kiểm tra lại quyền và trạng thái."
              : "Confirming changes real data. The admin control re-checks permission and state."}
          </p>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setStep("review")}
              disabled={pending}
              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 disabled:opacity-40"
            >
              {isVi ? "Quay lại" : "Back"}
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={confirm}
              disabled={!canConfirm}
              className="inline-flex items-center gap-1 rounded-md border border-destructive/50 bg-destructive px-2.5 py-1 text-[11px] text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              )}
              {isVi ? "Xác nhận thay đổi" : "Confirm change"}
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
        {isVi
          ? "Trợ lý chỉ đề xuất. Bạn xác nhận; thao tác thật chạy qua màn hình quản trị."
          : "The assistant only proposes. You confirm; the real action runs through the admin control."}
      </p>
    </section>
  );
}

export function AdminAssistantMessage({
  message,
  locale,
  isStreaming,
  onRefreshProposal,
}: AdminAssistantMessageProps) {
  const isVi = locale === "vi";
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const text = textOf(message);
  const toolParts = toolPartsOf(message);
  const completed = toolParts.filter(
    (part) => part.state === "output-available" || part.state === "output-error"
  );
  const running = toolParts.filter(
    (part) => part.state !== "output-available" && part.state !== "output-error"
  );

  // Drafts render as editable cards; a FAILED draft call stays in the data list
  // so the operator can see that it errored.
  const drafts = completed
    .map(draftValueOf)
    .filter((draft): draft is DraftValue => draft !== null);

  // Proposals render as confirmation cards and never as a "Data used" row: the
  // card IS the result, and a row count of zero would only add noise.
  const proposals = completed
    .map(proposalValueOf)
    .filter((proposal): proposal is AssistantProposal => proposal !== null);

  const dataParts = completed.filter(
    (part) => draftValueOf(part) === null && proposalValueOf(part) === null
  );

  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-3.5 py-2.5 text-[13px] leading-relaxed text-background">
          {text}
        </div>
      </div>
    );
  }

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — the answer stays readable on screen.
    }
  };

  return (
    <div className="space-y-2">
      {running.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {running.map((part, index) => (
            <span
              key={`${toolNameOf(part)}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              {toolLabel(toolNameOf(part), isVi)}
            </span>
          ))}
        </div>
      ) : null}

      {text ? (
        <div className="group relative max-w-[95%] text-[13px] leading-relaxed text-foreground">
          <p className="whitespace-pre-wrap">{text}</p>

          <button
            type="button"
            onClick={handleCopy}
            aria-label={isVi ? "Sao chép câu trả lời" : "Copy answer"}
            className="mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/60 group-hover:opacity-100"
          >
            {copied ? (
              <Check className="h-3 w-3" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
            {copied
              ? isVi
                ? "Đã chép"
                : "Copied"
              : isVi
                ? "Sao chép"
                : "Copy"}
          </button>
        </div>
      ) : null}

      {!text && isStreaming && running.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {isVi ? "Đang soạn câu trả lời…" : "Composing a reply…"}
        </p>
      ) : null}

      {drafts.map((draft, index) => (
        <DraftCard key={index} draft={draft} isVi={isVi} />
      ))}

      {proposals.map((proposal, index) => (
        <ProposalCard
          key={`${proposal.type}-${proposal.targetRef}-${index}`}
          proposal={proposal}
          isVi={isVi}
          onRefresh={() => onRefreshProposal?.(proposal)}
        />
      ))}

      {dataParts.length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-muted/30">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/50"
          >
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                open ? "rotate-0" : "-rotate-90"
              )}
              aria-hidden="true"
            />
            {isVi
              ? `Dữ liệu đã dùng (${dataParts.length})`
              : `Data used (${dataParts.length})`}
          </button>

          {open ? (
            <ul className="space-y-1.5 border-t border-border/60 px-2.5 py-2">
              {dataParts.map((part, index) => {
                const name = toolNameOf(part);
                const rows = rowCountOf(part.output);
                const failed = part.state === "output-error";

                return (
                  <li key={`${name}-${index}`} className="text-[11px] leading-snug">
                    <p className="flex flex-wrap items-center gap-x-1.5 text-foreground">
                      <span className="font-medium">{toolLabel(name, isVi)}</span>
                      <span className="text-muted-foreground">({name})</span>
                      {rows !== null ? (
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {rows} {isVi ? "dòng" : rows === 1 ? "row" : "rows"}
                        </span>
                      ) : null}
                      {failed ? (
                        <span className="text-[10px] uppercase tracking-[0.08em] text-destructive">
                          {isVi ? "lỗi" : "failed"}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 break-words font-mono text-[10.5px] text-muted-foreground">
                      {formatArgs(part.input)}
                    </p>
                    {!failed ? (
                      <DataUsedTables
                        name={name}
                        output={part.output}
                        isVi={isVi}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
