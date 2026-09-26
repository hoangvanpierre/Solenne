import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  ArrowLeft,
  FileText,
  MapPin,
  Package,
  PackageX,
  Receipt,
  ShieldAlert,
  User,
} from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { getAdminOrderById } from "@/lib/orders";
import { formatPrice } from "@/lib/utils";
import { OrderStatusBadge, RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import type { Order } from "@/types";

export const metadata: Metadata = {
  title: "Order Details — Administration",
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({
  params,
}: AdminOrderDetailPageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const isVi = locale === "vi";

  let order: Order | null = null;
  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;
  let orderNotFound = false;

  // Reject malformed IDs before issuing a query to avoid 22P02 database errors
  if (!UUID_REGEX.test(id)) {
    orderNotFound = true;
  } else {
    try {
      // Explicit server-side permission enforcement.
      // Never rely solely on the layout boundary.
      await requirePermission("order.read");

      order = await getAdminOrderById(id);
      if (!order) {
        orderNotFound = true;
      }
    } catch (error) {
      if (isUnauthenticatedAuthError(error)) {
        redirect("/login");
      }

      if (isRestrictedAuthError(error)) {
        accountRestricted = true;
      } else if (error instanceof AuthError) {
        // 403 Forbidden: active actor lacking order.read
        forbiddenAccess = true;
      } else {
        console.error("AdminOrderDetailPage: Failed to load order:", error);
        loadFailed = true;
      }
    }
  }

  if (accountRestricted) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl">
          <RestrictedAccountNotice locale={locale} />
        </div>
      </div>
    );
  }

  if (forbiddenAccess) {
    return (
      <div className="py-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber/10">
            <ShieldAlert className="h-6 w-6 text-amber" />
          </div>

          <h2 className="mt-5 font-serif text-2xl font-medium text-foreground">
            {isVi ? "Khu vực không khả dụng" : "Area unavailable"}
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
            {isVi
              ? "Quý khách không có quyền truy cập vào thông tin đơn hàng này."
              : "You do not have permission to view this order."}
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild variant="outline">
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>
                  {isVi ? "Về danh sách đơn hàng" : "Back to Orders"}
                </span>
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="py-8 space-y-6">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Danh sách đơn hàng" : "Orders"}</span>
          </Link>
        </nav>

        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium text-destructive">
            {isVi
              ? "Không thể tải chi tiết đơn hàng lúc này. Vui lòng làm mới trang hoặc thử lại sau."
              : "Unable to load order details at this time. Please refresh the page or try again later."}
          </p>
        </div>
      </div>
    );
  }

  if (orderNotFound || !order) {
    return (
      <div className="py-8 space-y-6">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Danh sách đơn hàng" : "Orders"}</span>
          </Link>
        </nav>

        <div className="flex flex-col items-center justify-center rounded-2xl border border-border py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/40">
            <PackageX className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 font-serif text-xl font-medium text-foreground">
            {isVi ? "Không tìm thấy đơn hàng" : "Order Not Found"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            {isVi
              ? "Đơn hàng này không tồn tại hoặc quý khách không có quyền truy cập."
              : "This order does not exist or you do not have permission to view it."}
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>{isVi ? "Về danh sách đơn hàng" : "Back to Orders"}</span>
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const shipping = order.shippingAddress;
  const customerName =
    shipping?.fullName?.trim() ||
    (isVi ? "Khách vãng lai" : "Guest / Unknown");
  const customerEmail = shipping?.email?.trim() || null;
  const customerPhone = shipping?.phone?.trim() || null;

  return (
    <div className="space-y-8 py-4">
      {/* Header & Breadcrumbs */}
      <header className="space-y-4">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/orders"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Danh sách đơn hàng" : "Back to Orders"}</span>
          </Link>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {order.orderNumber}
              </h1>
              <OrderStatusBadge status={order.status} locale={locale} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                {new Date(order.createdAt).toLocaleDateString(
                  isVi ? "vi-VN" : "en-US",
                  {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                )}
              </span>
              <span>•</span>
              <span className="font-mono">ID: {order.id}</span>
            </div>
          </div>

          <div className="sm:text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {isVi ? "Tổng đơn hàng" : "Order Total"}
            </div>
            <div className="font-serif text-3xl font-semibold text-foreground">
              {formatPrice(order.total)}
            </div>
          </div>
        </div>
      </header>

      {/* Main Order Content */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left 2 Columns: Items & Financials */}
        <div className="space-y-6 lg:col-span-2">
          {/* Order Items */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Package className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-serif text-lg font-medium text-foreground">
                {isVi ? "Tác phẩm đặt mua" : "Order Items"}
              </h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {order.items.length}{" "}
                {isVi
                  ? "mục"
                  : order.items.length === 1
                    ? "item"
                    : "items"}
              </span>
            </div>

            <div className="divide-y divide-border">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">
                      {item.productName}
                    </div>
                    {item.variantName && (
                      <div className="text-xs text-muted-foreground">
                        {item.variantName}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {formatPrice(item.unitPrice)} × {item.quantity}
                    </div>
                  </div>

                  <div className="font-medium text-foreground text-sm whitespace-nowrap">
                    {formatPrice(item.totalPrice)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment & Financial Summary */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-serif text-lg font-medium text-foreground">
                {isVi ? "Tóm tắt thanh toán" : "Payment Summary"}
              </h2>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{isVi ? "Tạm tính" : "Subtotal"}</span>
                <span className="font-medium text-foreground">
                  {formatPrice(order.subtotal)}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground">
                <span>{isVi ? "Phí vận chuyển" : "Shipping Fee"}</span>
                <span className="font-medium text-foreground">
                  {order.shippingFee === 0
                    ? isVi
                      ? "Miễn phí"
                      : "Free"
                    : formatPrice(order.shippingFee)}
                </span>
              </div>

              {order.discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{isVi ? "Giảm giá" : "Discount"}</span>
                  <span className="font-medium text-foreground">
                    -{formatPrice(order.discount)}
                  </span>
                </div>
              )}

              <div className="border-t border-border pt-3 flex justify-between text-base">
                <span className="font-medium text-foreground">
                  {isVi ? "Tổng cộng" : "Total"}
                </span>
                <span className="font-serif text-lg font-semibold text-foreground">
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Notes (if present) */}
          {order.notes && (
            <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-serif text-lg font-medium text-foreground">
                  {isVi ? "Ghi chú của khách hàng" : "Customer Notes"}
                </h2>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {order.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right 1 Column: Customer & Shipping Details */}
        <div className="space-y-6">
          {/* Customer Card */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-serif text-lg font-medium text-foreground">
                {isVi ? "Thông tin khách hàng" : "Customer"}
              </h2>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Tên khách hàng" : "Name"}
                </div>
                <div className="mt-0.5 font-medium text-foreground">
                  {customerName}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Email" : "Email"}
                </div>
                <div className="mt-0.5 text-foreground truncate">
                  {customerEmail || (
                    <span className="text-muted-foreground italic">
                      {isVi ? "Chưa cung cấp" : "Not provided"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Số điện thoại" : "Phone"}
                </div>
                <div className="mt-0.5 text-foreground">
                  {customerPhone || (
                    <span className="text-muted-foreground italic">
                      {isVi ? "Chưa cung cấp" : "Not provided"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Mã tài khoản" : "Account ID"}
                </div>
                <div className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
                  {order.userId || (
                    <span className="italic">
                      {isVi ? "Khách vãng lai" : "Guest"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Address Card */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-serif text-lg font-medium text-foreground">
                {isVi ? "Địa chỉ giao hàng" : "Shipping Address"}
              </h2>
            </div>

            {shipping ? (
              <div className="space-y-1.5 text-sm text-foreground">
                <div className="font-medium">{shipping.fullName}</div>
                {shipping.phone && (
                  <div className="text-xs text-muted-foreground">
                    {shipping.phone}
                  </div>
                )}
                <div className="pt-1 text-muted-foreground space-y-0.5">
                  <div>{shipping.line1}</div>
                  {shipping.line2 && <div>{shipping.line2}</div>}
                  <div>
                    {[
                      shipping.wardName || shipping.wardCode,
                      shipping.city,
                      shipping.provinceName || shipping.state,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                  {shipping.postalCode && (
                    <div>{shipping.postalCode}</div>
                  )}
                  <div>
                    {shipping.country || shipping.countryCode || "Vietnam"}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {isVi
                  ? "Không có thông tin địa chỉ giao hàng."
                  : "No shipping address provided."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
