"use client";

import { useState } from "react";
import type { UIMessage } from "ai";
import { Check, ChevronDown, Copy, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOOL_CATALOGUE, type AdminAssistantToolName } from "@/lib/admin-assistant/access";
import { buildDataUsedTables } from "@/lib/admin-assistant/presentation";

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

export function AdminAssistantMessage({
  message,
  locale,
  isStreaming,
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

      {completed.length > 0 ? (
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
              ? `Dữ liệu đã dùng (${completed.length})`
              : `Data used (${completed.length})`}
          </button>

          {open ? (
            <ul className="space-y-1.5 border-t border-border/60 px-2.5 py-2">
              {completed.map((part, index) => {
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
