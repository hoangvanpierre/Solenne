import type { AdminAssistantToolName } from "./access";

// ---------------------------------------------------------------------------
// Solenne admin assistant — "Data used" presentation tables.
//
// The drawer shows the rows a tool actually returned, so an operator can check
// a figure against the source instead of trusting the model's prose.
//
// Three rules keep the table honest:
//   1. It renders ONLY fields that are in the tool output — the same fields the
//      model received. Nothing is added, recomputed or looked up again.
//   2. Money is copied verbatim from `{ amount, formatted }`; this module never
//      formats, rounds or converts a currency.
//   3. It never shows more rows than the tool's own row cap, and it never
//      paginates — what is missing is reported in `note`, not fetched.
//
// Identifier-only fields the model also receives (row uuids, product slugs) are
// not rendered: they are not figures an operator checks, and the admin tables
// do not show them either. Every rendered cell is copied from the tool output.
//
// Pure data in, pure data out: no React, no `@/` runtime imports, so
// scripts/verify-admin-assistant.mjs can import this module directly.
// ---------------------------------------------------------------------------

export type DataUsedLocale = "en" | "vi";

export interface DataUsedColumn {
  key: string;
  label: string;
  align: "left" | "right";
}

export interface DataUsedTable {
  caption: string;
  columns: DataUsedColumn[];
  rows: string[][];
  /** Truncation / permission / filter context. Never a number the tool did not return. */
  note?: string;
}

type Rec = Record<string, unknown>;

const DASH = "—";

/**
 * Same caps as TOOL_CATALOGUE, restated here so this module has no runtime
 * imports and can be loaded by the static harness. `scripts/verify-admin-
 * assistant.mjs` asserts the two tables are equal, so they cannot drift.
 */
export const DATA_USED_ROW_CAPS: Record<AdminAssistantToolName, number> = {
  getOrderSummary: 1,
  listOrders: 10,
  findOrder: 10,
  getOrderDetail: 10,
  listLowStock: 15,
  getProductStock: 10,
  findCustomer: 10,
  getDashboardMetrics: 5,
};

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordsOf(value: unknown): Rec[] {
  return Array.isArray(value) ? value.filter(isRec) : [];
}

function text(value: unknown): string {
  if (typeof value === "string") return value.length > 0 ? value : DASH;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return DASH;
}

/** Money exactly as the tool returned it — `formatted` is never rebuilt here. */
function money(value: unknown): string {
  return isRec(value) && typeof value.formatted === "string"
    ? value.formatted
    : DASH;
}

function count(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : DASH;
}

function yesNo(value: unknown, isVi: boolean): string {
  if (value === true) return isVi ? "đang bán" : "active";
  if (value === false) return isVi ? "nháp" : "draft";
  return DASH;
}

function column(
  key: string,
  label: string,
  align: DataUsedColumn["align"] = "left"
): DataUsedColumn {
  return { key, label, align };
}

// ---------------------------------------------------------------------------
// Order rows (shared by listOrders and findOrder)
// ---------------------------------------------------------------------------

function orderColumns(isVi: boolean): DataUsedColumn[] {
  return [
    column("orderNumber", isVi ? "Mã đơn" : "Order"),
    column("status", isVi ? "Trạng thái" : "Status"),
    column("total", isVi ? "Tổng" : "Total", "right"),
    column("placedAt", isVi ? "Đặt lúc" : "Placed"),
    column("customerName", isVi ? "Khách" : "Customer"),
    column("customerEmail", "Email"),
  ];
}

function orderRow(row: Rec): string[] {
  return [
    text(row.orderNumber),
    text(row.status),
    money(row.total),
    text(row.placedAt),
    text(row.customerName),
    text(row.customerEmail),
  ];
}

function truncationNote(
  output: Rec,
  shown: number,
  isVi: boolean
): string | undefined {
  const matched =
    typeof output.matchedCount === "number" ? output.matchedCount : null;

  if (output.truncated === true && matched !== null && matched > shown) {
    return isVi
      ? `Hiển thị ${shown}/${matched} kết quả.`
      : `Showing ${shown} of ${matched} matches.`;
  }

  return undefined;
}

function ordersTable(
  output: Rec,
  cap: number,
  isVi: boolean,
  caption: string
): DataUsedTable {
  const all = recordsOf(output.orders);
  const rows = all.slice(0, cap).map(orderRow);
  const note = truncationNote(output, rows.length, isVi);

  return {
    caption,
    columns: orderColumns(isVi),
    rows,
    ...(note ? { note } : {}),
  };
}

// ---------------------------------------------------------------------------
// Inventory rows (shared by listLowStock and getProductStock)
// ---------------------------------------------------------------------------

function stockColumns(isVi: boolean): DataUsedColumn[] {
  return [
    column("productName", isVi ? "Sản phẩm" : "Product"),
    column("variantName", isVi ? "Phân loại" : "Variant"),
    column("sku", "SKU"),
    column("stock", isVi ? "Tồn" : "Stock", "right"),
    column("price", isVi ? "Giá" : "Price", "right"),
    column("productActive", isVi ? "Trạng thái" : "Product"),
  ];
}

function stockRow(row: Rec, isVi: boolean): string[] {
  return [
    text(row.productName),
    text(row.variantName),
    text(row.sku),
    count(row.stock),
    money(row.price),
    yesNo(row.productActive, isVi),
  ];
}

function stockTable(
  output: Rec,
  cap: number,
  isVi: boolean,
  caption: string
): DataUsedTable {
  const all = recordsOf(output.variants);
  const rows = all.slice(0, cap).map((row) => stockRow(row, isVi));
  const note = truncationNote(output, rows.length, isVi);

  return {
    caption,
    columns: stockColumns(isVi),
    rows,
    ...(note ? { note } : {}),
  };
}

// ---------------------------------------------------------------------------
// Per-tool builders
// ---------------------------------------------------------------------------

function summaryTables(output: Rec, isVi: boolean): DataUsedTable[] {
  const counts = isRec(output.counts) ? output.counts : {};
  const statuses = [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];

  const rows: string[][] = [[isVi ? "Tổng" : "Total", count(counts.total)]];
  for (const status of statuses) {
    if (typeof counts[status] !== "number") continue;
    rows.push([status, count(counts[status])]);
  }

  const since = typeof output.since === "string" ? output.since : null;
  const notes: string[] = [];

  if (since) {
    notes.push(`${isVi ? "Tính từ" : "Since"} ${since}`);
  }
  notes.push(
    isVi
      ? "Không có tổng doanh thu: không màn hình quản trị nào hiển thị."
      : "No revenue total: no admin screen shows one."
  );

  return [
    {
      caption: isVi ? "Số đơn theo trạng thái" : "Order counts by status",
      columns: [
        column("status", isVi ? "Trạng thái" : "Status"),
        column("count", isVi ? "Số đơn" : "Orders", "right"),
      ],
      rows,
      note: notes.join(" · "),
    },
  ];
}

function detailTables(output: Rec, cap: number, isVi: boolean): DataUsedTable[] {
  const totals = isRec(output.totals) ? output.totals : {};
  const shipping = isRec(output.shipping) ? output.shipping : {};

  const fields: [string, string][] = [
    [isVi ? "Mã đơn" : "Order", text(output.orderNumber)],
    [isVi ? "Trạng thái" : "Status", text(output.status)],
    [isVi ? "Đặt lúc" : "Placed", text(output.placedAt)],
    [isVi ? "Cập nhật" : "Updated", text(output.updatedAt)],
    [isVi ? "Mã vận đơn" : "Tracking", text(output.trackingCode)],
    [isVi ? "Tạm tính" : "Subtotal", money(totals.subtotal)],
    [isVi ? "Phí giao" : "Shipping", money(totals.shippingFee)],
    [isVi ? "Giảm giá" : "Discount", money(totals.discount)],
    [isVi ? "Tổng" : "Total", money(totals.total)],
    [isVi ? "Người nhận" : "Recipient", text(shipping.recipientName)],
    [isVi ? "Thành phố" : "City", text(shipping.city)],
    [isVi ? "Quốc gia" : "Country", text(shipping.country)],
  ];

  const items = recordsOf(output.items).slice(0, cap);
  const itemRows = items.map((item) => [
    text(item.productName),
    text(item.variantName),
    count(item.quantity),
    money(item.unitPrice),
    money(item.lineTotal),
  ]);

  const itemCount =
    typeof output.itemCount === "number" ? output.itemCount : items.length;

  const itemNotes: string[] = [];
  if (output.itemsTruncated === true && itemCount > items.length) {
    itemNotes.push(
      isVi
        ? `Hiển thị ${items.length}/${itemCount} dòng hàng.`
        : `Showing ${items.length} of ${itemCount} line items.`
    );
  }
  if (items.length === 0) {
    itemNotes.push(isVi ? "Không có dòng hàng." : "No line items.");
  }

  return [
    {
      caption: isVi ? "Đơn hàng" : "Order",
      columns: [
        column("field", isVi ? "Trường" : "Field"),
        column("value", isVi ? "Giá trị" : "Value"),
      ],
      rows: fields,
    },
    {
      caption: isVi ? "Dòng hàng" : "Line items",
      columns: [
        column("productName", isVi ? "Sản phẩm" : "Product"),
        column("variantName", isVi ? "Phân loại" : "Variant"),
        column("quantity", isVi ? "SL" : "Qty", "right"),
        column("unitPrice", isVi ? "Đơn giá" : "Unit price", "right"),
        column("lineTotal", isVi ? "Thành tiền" : "Line total", "right"),
      ],
      rows: itemRows,
      ...(itemNotes.length > 0 ? { note: itemNotes.join(" · ") } : {}),
    },
  ];
}

function customerTables(output: Rec, cap: number, isVi: boolean): DataUsedTable[] {
  const all = recordsOf(output.customers);
  const rows = all.slice(0, cap).map((customer) => [
    text(customer.fullName),
    text(customer.status),
    text(customer.joinedAt),
    count(customer.orderCount),
    money(customer.lifetimeSpend),
  ]);

  const notes: string[] = [];
  const truncated = truncationNote(output, rows.length, isVi);
  if (truncated) notes.push(truncated);

  const withheld = all.some(
    (customer) =>
      customer.orderCount === null || customer.lifetimeSpend === null
  );
  if (withheld) {
    notes.push(
      isVi
        ? "Số đơn và tổng chi tiêu chỉ hiện khi bạn có quyền xem đơn hàng (order.read)."
        : "Order count and lifetime spend appear only with order.read."
    );
  }

  return [
    {
      caption: isVi ? "Khách hàng" : "Customers",
      columns: [
        column("fullName", isVi ? "Tên" : "Name"),
        column("status", isVi ? "Trạng thái" : "Status"),
        column("joinedAt", isVi ? "Tham gia" : "Joined"),
        column("orderCount", isVi ? "Số đơn" : "Orders", "right"),
        column("lifetimeSpend", isVi ? "Tổng chi" : "Lifetime spend", "right"),
      ],
      rows,
      note: notes.join(" · "),
    },
  ];
}

function dashboardTables(
  output: Rec,
  cap: number,
  isVi: boolean
): DataUsedTable[] {
  const tables: DataUsedTable[] = [];

  const orders = isRec(output.orders) ? output.orders : null;
  if (orders) {
    tables.push({
      caption: isVi ? "Đơn hàng" : "Orders",
      columns: [
        column("metric", isVi ? "Chỉ số" : "Metric"),
        column("value", isVi ? "Số lượng" : "Count", "right"),
      ],
      rows: [
        [isVi ? "Tổng" : "Total", count(orders.total)],
        [isVi ? "Chờ thanh toán" : "Awaiting payment", count(orders.awaitingPayment)],
        [isVi ? "Đang xử lý/gửi" : "In fulfillment", count(orders.inFulfillment)],
        [isVi ? "Đã hủy" : "Cancelled", count(orders.cancelled)],
      ],
    });
  }

  const customers = isRec(output.customers) ? output.customers : null;
  if (customers) {
    tables.push({
      caption: isVi ? "Khách hàng" : "Customers",
      columns: [
        column("metric", isVi ? "Chỉ số" : "Metric"),
        column("value", isVi ? "Số lượng" : "Count", "right"),
      ],
      rows: [
        [isVi ? "Tổng" : "Total", count(customers.total)],
        [isVi ? "Bị hạn chế" : "Restricted", count(customers.restricted)],
      ],
    });
  }

  const inventory = isRec(output.inventory) ? output.inventory : null;
  if (inventory) {
    tables.push({
      caption: isVi ? "Tồn kho" : "Inventory",
      columns: [
        column("metric", isVi ? "Chỉ số" : "Metric"),
        column("value", isVi ? "Số lượng" : "Count", "right"),
      ],
      rows: [
        [isVi ? "Số phân loại" : "Variants", count(inventory.variantCount)],
        [isVi ? "Sắp hết" : "Low stock", count(inventory.lowStockCount)],
        [isVi ? "Hết hàng" : "Out of stock", count(inventory.outOfStockCount)],
      ],
    });

    const candidates = recordsOf(inventory.restockCandidates).slice(0, cap);
    if (candidates.length > 0) {
      tables.push({
        caption: isVi ? "Cần nhập thêm" : "Restock candidates",
        columns: [
          column("productName", isVi ? "Sản phẩm" : "Product"),
          column("variantName", isVi ? "Phân loại" : "Variant"),
          column("stock", isVi ? "Tồn" : "Stock", "right"),
        ],
        rows: candidates.map((candidate) => [
          text(candidate.productName),
          text(candidate.variantName),
          count(candidate.stock),
        ]),
      });
    }
  }

  const omitted = Array.isArray(output.omitted)
    ? output.omitted.filter((entry): entry is string => typeof entry === "string")
    : [];

  if (omitted.length > 0) {
    tables.push({
      caption: isVi ? "Không hiển thị" : "Not shown",
      columns: [
        column("group", isVi ? "Nhóm" : "Group"),
        column("reason", isVi ? "Lý do" : "Reason"),
      ],
      rows: omitted.map((group) => [
        group,
        isVi ? "không có quyền" : "no permission",
      ]),
    });
  }

  return tables;
}

/**
 * Build the read-only tables for one completed tool call.
 *
 * `output` is the exact object the model received. An unknown tool name or a
 * non-object output yields no tables, so the drawer degrades to the existing
 * name/args/row-count line instead of inventing a shape.
 */
export function buildDataUsedTables(
  toolName: string,
  output: unknown,
  locale: DataUsedLocale | string
): DataUsedTable[] {
  if (!isRec(output)) return [];

  const isVi = locale === "vi";
  const cap = DATA_USED_ROW_CAPS[toolName as AdminAssistantToolName] ?? 10;

  switch (toolName) {
    case "getOrderSummary":
      return summaryTables(output, isVi);
    case "listOrders":
      return [
        ordersTable(output, cap, isVi, isVi ? "Đơn hàng" : "Orders"),
      ];
    case "findOrder":
      return [
        ordersTable(output, cap, isVi, isVi ? "Kết quả tìm đơn" : "Order matches"),
      ];
    case "getOrderDetail":
      return detailTables(output, cap, isVi);
    case "listLowStock":
      return [
        stockTable(output, cap, isVi, isVi ? "Hàng sắp hết" : "Low stock"),
      ];
    case "getProductStock":
      return [
        stockTable(output, cap, isVi, isVi ? "Tồn kho sản phẩm" : "Product stock"),
      ];
    case "findCustomer":
      return customerTables(output, cap, isVi);
    case "getDashboardMetrics":
      return dashboardTables(output, cap, isVi);
    default:
      return [];
  }
}
