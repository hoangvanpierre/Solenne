// ---------------------------------------------------------------------------
// Solenne Audit Utilities (Client-Safe & Pure TypeScript).
//
// Shared between Client Components and Server Components.
// Contains zero dependencies on server-only modules, cookies, headers, or database clients.
// ---------------------------------------------------------------------------

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID_REGEX.test(id);
}

export const AUDIT_ACTIONS = [
  "order.created",
  "order.status_transition",
  "order.cancelled",
  "order.fulfillment_rollback",
  "order.create_rolled_back",
  "order.stock_conflict",
  "inventory.adjusted",
  "product.created",
  "product.updated",
  "product.deleted",
  "product_variant.created",
  "product_variant.updated",
  "product_variant.deleted",
  "user.role_changed",
  "customer.status_changed",
  "customer.reinstated",
  "assistant.tool_used",
] as const;

export const AUDIT_ACTION_CATEGORIES = [
  "order",
  "inventory",
  "product",
  "user",
  "customer",
] as const;

export const AUDIT_RESOURCE_TYPES = [
  "order",
  "product",
  "product_variant",
  "profile",
] as const;

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN =
  /(?:\+?\d{1,4}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}(?!\d)/g;

/**
 * Redacts detectable emails and phone numbers from free-text operational notes.
 * Note: Pattern-based redaction reduces inadvertent PII disclosure but cannot
 * guarantee detection of all unstructured personal information.
 */
export function redactSensitiveText(text: string): string {
  if (typeof text !== "string") return text;
  return text
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        return "[REDACTED_PHONE]";
      }
      return match;
    });
}

/**
 * Formats a localized, human-readable summary for a known audit action.
 */
export function formatAuditSummary(
  action: string,
  metadata: Record<string, unknown>,
  locale: string = "en"
): string {
  const isVi = locale === "vi";

  switch (action) {
    case "order.created": {
      const orderNum = metadata.orderNumber ?? metadata.order_number;
      const orderNumStr = orderNum ? `#${orderNum}` : "";
      const count =
        metadata.itemCount != null
          ? Number(metadata.itemCount)
          : metadata.item_count != null
          ? Number(metadata.item_count)
          : null;
      if (isVi) {
        return `Đơn hàng ${orderNumStr} được tạo${count !== null ? ` (${count} sản phẩm)` : ""}`;
      }
      return `Order ${orderNumStr} created${count !== null ? ` (${count} item${count === 1 ? "" : "s"})` : ""}`;
    }

    case "order.status_transition": {
      const orderNum = metadata.orderNumber ?? metadata.order_number;
      const orderNumStr = orderNum ? `#${orderNum}` : "";
      const toStatus =
        (metadata.new_status ?? metadata.status) as string | undefined;
      const reason = metadata.reason ? String(metadata.reason) : undefined;
      if (isVi) {
        return `Đơn hàng ${orderNumStr} chuyển trạng thái sang ${toStatus ?? "mới"}${
          reason ? ` (Lý do: ${reason})` : ""
        }`;
      }
      return `Order ${orderNumStr} transitioned to ${toStatus ?? "new"}${
        reason ? ` (Reason: ${reason})` : ""
      }`;
    }

    case "order.cancelled": {
      const orderNum = metadata.orderNumber ?? metadata.order_number;
      const orderNumStr = orderNum ? `#${orderNum}` : "";
      const reason = metadata.reason ? String(metadata.reason) : undefined;
      const restored =
        metadata.items_restored != null ? Number(metadata.items_restored) : null;
      if (isVi) {
        return `Đơn hàng ${orderNumStr} đã hủy${
          reason ? ` (Lý do: ${reason})` : ""
        }${restored !== null ? ` — hoàn lại ${restored} sản phẩm vào kho` : ""}`;
      }
      return `Order ${orderNumStr} cancelled${
        reason ? ` (Reason: ${reason})` : ""
      }${restored !== null ? ` — ${restored} item${restored === 1 ? "" : "s"} restored to stock` : ""}`;
    }

    case "order.fulfillment_rollback": {
      const orderNum = metadata.orderNumber ?? metadata.order_number;
      const orderNumStr = orderNum ? `#${orderNum}` : "";
      const reason = metadata.reason ? String(metadata.reason) : undefined;
      if (isVi) {
        return `Hoàn tác giao vận đơn hàng ${orderNumStr} về đang xử lý${
          reason ? ` (Lý do: ${reason})` : ""
        }`;
      }
      return `Order ${orderNumStr} fulfillment rolled back from shipped to processing${
        reason ? ` (Reason: ${reason})` : ""
      }`;
    }

    case "order.create_rolled_back": {
      const orderNum = metadata.orderNumber ?? metadata.order_number;
      const orderNumStr = orderNum ? `#${orderNum}` : "";
      if (isVi) {
        return `Hoàn tác tạo đơn hàng ${orderNumStr}`;
      }
      return `Rolled back order creation ${orderNumStr}`;
    }

    case "order.stock_conflict": {
      const orderNum = metadata.orderNumber ?? metadata.order_number;
      const orderNumStr = orderNum ? `#${orderNum}` : "";
      if (isVi) {
        return `Xung đột tồn kho khi đặt đơn ${orderNumStr}`;
      }
      return `Stock conflict detected during order ${orderNumStr}`;
    }

    case "inventory.adjusted": {
      const sku = metadata.sku ? `SKU: ${metadata.sku}` : "";
      const delta = typeof metadata.delta === "number" ? metadata.delta : null;
      const after =
        metadata.new_stock != null
          ? metadata.new_stock
          : metadata.quantity_after != null
          ? metadata.quantity_after
          : null;
      const deltaStr =
        delta !== null ? (delta > 0 ? `+${delta}` : `${delta}`) : "";
      const reason = metadata.reason ? String(metadata.reason) : undefined;
      if (isVi) {
        return `Điều chỉnh tồn kho ${sku} (${deltaStr ? deltaStr + ", " : ""}hiện có: ${after ?? "–"})${
          reason ? ` (Lý do: ${reason})` : ""
        }`;
      }
      return `Inventory adjusted ${sku} (${deltaStr ? deltaStr + ", " : ""}current: ${after ?? "–"})${
        reason ? ` (Reason: ${reason})` : ""
      }`;
    }

    case "product.created": {
      const name = metadata.name ?? metadata.product_name;
      const nameStr = name ? `"${name}"` : "";
      if (isVi) {
        return `Tạo mới sản phẩm ${nameStr}`;
      }
      return `Product ${nameStr} created`;
    }

    case "product.updated": {
      const name = metadata.name ?? metadata.product_name;
      const nameStr = name ? `"${name}"` : "";
      if (isVi) {
        return `Cập nhật thông tin sản phẩm ${nameStr}`;
      }
      return `Product ${nameStr} updated`;
    }

    case "product.deleted": {
      const name = metadata.name ?? metadata.product_name;
      const nameStr = name ? `"${name}"` : "";
      if (isVi) {
        return `Xóa sản phẩm ${nameStr}`;
      }
      return `Product ${nameStr} deleted`;
    }

    case "product_variant.created": {
      const name = metadata.name ?? metadata.variant_name ?? metadata.sku ?? "";
      if (isVi) {
        return `Thêm phiên bản sản phẩm "${name}"`;
      }
      return `Product variant "${name}" created`;
    }

    case "product_variant.updated": {
      const sku = metadata.sku ? `SKU: ${metadata.sku}` : "";
      if (isVi) {
        return `Cập nhật phiên bản sản phẩm ${sku}`;
      }
      return `Product variant ${sku} updated`;
    }

    case "product_variant.deleted": {
      const sku = metadata.sku ? `SKU: ${metadata.sku}` : "";
      if (isVi) {
        return `Xóa phiên bản sản phẩm ${sku}`;
      }
      return `Product variant ${sku} deleted`;
    }

    case "user.role_changed": {
      const role = (metadata.role ?? metadata.new_role) as string | undefined;
      if (isVi) {
        return `Cập nhật vai trò người dùng thành ${role ?? ""}`;
      }
      return `User role updated to ${role ?? ""}`;
    }

    case "customer.status_changed": {
      const oldStatus = (metadata.old_status ?? metadata.previous_status) as
        | string
        | undefined;
      const newStatus = (metadata.new_status ?? metadata.status) as
        | string
        | undefined;
      const reason = metadata.reason ? String(metadata.reason) : undefined;
      if (isVi) {
        return `Thay đổi trạng thái khách hàng từ ${oldStatus ?? "–"} sang ${newStatus ?? "–"}${
          reason ? ` (Lý do: ${reason})` : ""
        }`;
      }
      return `Customer status changed from ${oldStatus ?? "–"} to ${newStatus ?? "–"}${
        reason ? ` (Reason: ${reason})` : ""
      }`;
    }

    case "customer.reinstated": {
      const reason = metadata.reason ? String(metadata.reason) : undefined;
      if (isVi) {
        return `Kích hoạt lại tài khoản khách hàng bị cấm sang hoạt động${
          reason ? ` (Lý do: ${reason})` : ""
        }`;
      }
      return `Customer account reinstated from banned to active${
        reason ? ` (Reason: ${reason})` : ""
      }`;
    }

    case "assistant.tool_used": {
      const tool = metadata.tool ? String(metadata.tool) : "unknown tool";
      const rows =
        metadata.rowCount != null ? Number(metadata.rowCount) : null;
      const failed = metadata.ok === false;
      if (isVi) {
        return failed
          ? `Trợ lý gọi ${tool} nhưng thất bại`
          : `Trợ lý gọi ${tool}${rows !== null ? ` (${rows} dòng)` : ""}`;
      }
      return failed
        ? `Assistant called ${tool} but it failed`
        : `Assistant called ${tool}${rows !== null ? ` (${rows} row${rows === 1 ? "" : "s"})` : ""}`;
    }

    default: {
      return isVi ? `Hành động: ${action}` : `Action: ${action}`;
    }
  }
}
