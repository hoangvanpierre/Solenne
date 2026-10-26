import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  ArrowLeft,
  FileText,
  Mail,
  MapPin,
  Package,
  PackageX,
  Receipt,
  ShieldAlert,
  Truck,
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
import {
  AdminBreadcrumb,
  AdminPageHeader,
  AdminStatePanel,
  OrderCancelControl,
  OrderDraftReplyButton,
  OrderFulfillmentControl,
} from "@/components/admin";
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
        <div className="mx-auto max-w-2xl">
          <AdminStatePanel
            title={isVi ? "Khu vực không khả dụng" : "Area unavailable"}
            description={
              isVi
                ? "Quý khách không có quyền truy cập vào thông tin đơn hàng này."
                : "You do not have permission to view this order."
            }
            icon={ShieldAlert}
            actions={
              <Button asChild variant="outline" className="font-normal text-xs">
                <Link
                  href="/admin/orders"
                  className="inline-flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isVi ? "Về danh sách đơn hàng" : "Back to Orders"}
                  </span>
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="space-y-6 py-8">
        <AdminBreadcrumb
          href="/admin/orders"
          label={isVi ? "Danh sách đơn hàng" : "Orders"}
        />

        <AdminStatePanel
          tone="danger"
          title={isVi ? "Không thể tải đơn hàng" : "Unable to load order"}
          description={
            isVi
              ? "Không thể tải chi tiết đơn hàng lúc này. Vui lòng làm mới trang hoặc thử lại sau."
              : "Unable to load order details at this time. Please refresh the page or try again later."
          }
          icon={ShieldAlert}
          actions={
            <Button asChild variant="outline" className="font-normal text-xs">
              <Link href="/admin/orders">
                {isVi ? "Thử lại" : "Try again"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (orderNotFound || !order) {
    return (
      <div className="space-y-6 py-8">
        <AdminBreadcrumb
          href="/admin/orders"
          label={isVi ? "Danh sách đơn hàng" : "Orders"}
        />

        <AdminStatePanel
          icon={PackageX}
          title={isVi ? "Không tìm thấy đơn hàng" : "Order Not Found"}
          description={
            isVi
              ? "Đơn hàng này không tồn tại hoặc quý khách không có quyền truy cập."
              : "This order does not exist or you do not have permission to view it."
          }
          actions={
            <Button asChild variant="outline" className="font-normal text-xs">
              <Link
                href="/admin/orders"
                className="inline-flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>
                  {isVi ? "Về danh sách đơn hàng" : "Back to Orders"}
                </span>
              </Link>
            </Button>
          }
        />
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
    <div className="space-y-6 py-4">
      <AdminBreadcrumb
        href="/admin/orders"
        label={isVi ? "Danh sách đơn hàng" : "Orders"}
      />

      <AdminPageHeader
        eyebrow={
          <div className="flex flex-wrap items-center gap-3">
            <OrderStatusBadge status={order.status} locale={locale} />
            <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {isVi ? "Hồ sơ đơn hàng" : "Order record"}
            </span>
          </div>
        }
        title={order.orderNumber}
        meta={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums font-normal">
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
            <span aria-hidden="true">•</span>
            <span>ID: {order.id}</span>
            {order.trackingCode && (
              <>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <Truck
                    className="h-3.5 w-3.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span>{isVi ? "Mã vận đơn: " : "Tracking: "}</span>
                  <span className="tabular-nums font-normal text-foreground select-all">
                    {order.trackingCode}
                  </span>
                </span>
              </>
            )}
          </div>
        }
        actions={
          <div>
            <div className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
              {isVi ? "Tổng đơn hàng" : "Order Total"}
            </div>
            <div className="tabular-nums text-3xl font-normal text-foreground">
              {formatPrice(order.total)}
            </div>
          </div>
        }
      />

      {/* Main Order Content */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left 2 Columns: Items & Financials */}
        <div className="space-y-6 lg:col-span-2">
          {/* Order Items */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Package className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-normal text-foreground">
                {isVi ? "Tác phẩm đặt mua" : "Order Items"}
              </h2>
              <span className="ml-auto text-xs text-muted-foreground font-normal tabular-nums">
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
                    <div className="font-normal text-foreground">
                      {item.productName}
                    </div>
                    {item.variantName && (
                      <div className="text-xs text-muted-foreground font-normal">
                        {item.variantName}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground tabular-nums font-normal">
                      {formatPrice(item.unitPrice)} × {item.quantity}
                    </div>
                  </div>

                  <div className="font-normal tabular-nums text-foreground text-sm whitespace-nowrap">
                    {formatPrice(item.totalPrice)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment & Financial Summary */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-normal text-foreground">
                {isVi ? "Tóm tắt thanh toán" : "Payment Summary"}
              </h2>
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-muted-foreground font-normal">
                <span>{isVi ? "Tạm tính" : "Subtotal"}</span>
                <span className="tabular-nums font-normal text-foreground">
                  {formatPrice(order.subtotal)}
                </span>
              </div>

              <div className="flex justify-between text-muted-foreground font-normal">
                <span>{isVi ? "Phí vận chuyển" : "Shipping Fee"}</span>
                <span className="tabular-nums font-normal text-foreground">
                  {order.shippingFee === 0
                    ? isVi
                      ? "Miễn phí"
                      : "Free"
                    : formatPrice(order.shippingFee)}
                </span>
              </div>

              {order.discount > 0 && (
                <div className="flex justify-between text-muted-foreground font-normal">
                  <span>{isVi ? "Giảm giá" : "Discount"}</span>
                  <span className="tabular-nums font-normal text-foreground">
                    -{formatPrice(order.discount)}
                  </span>
                </div>
              )}

              <div className="border-t border-border pt-3 flex justify-between text-base">
                <span className="font-normal text-foreground">
                  {isVi ? "Tổng cộng" : "Total"}
                </span>
                <span className="tabular-nums text-lg font-normal text-foreground">
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Notes (if present) */}
          {order.notes && (
            <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-normal text-foreground">
                  {isVi ? "Ghi chú của khách hàng" : "Customer Notes"}
                </h2>
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-normal">
                {order.notes}
              </p>
            </div>
          )}
        </div>

        {/* Right 1 Column: Customer & Shipping Details */}
        <div className="space-y-6">
          {/* Order Fulfillment Control */}
          <OrderFulfillmentControl
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={order.status}
            trackingCode={order.trackingCode}
            locale={locale}
          />

          {/* Order Actions (Cancel) */}
          <OrderCancelControl
            orderId={order.id}
            orderNumber={order.orderNumber}
            status={order.status}
            locale={locale}
            unitsCount={order.items.reduce(
              (sum, item) => sum + item.quantity,
              0
            )}
          />

          {/* Customer reply draft — opens the assistant with this order */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-lg font-normal text-foreground">
                {isVi ? "Thư cho khách" : "Customer Reply"}
              </h2>
            </div>
            <p className="text-xs font-normal leading-relaxed text-muted-foreground">
              {isVi
                ? "Trợ lý soạn bản nháp dựa trên đơn này và chính sách của Solenne. Bạn xem lại, sửa rồi tự gửi — không có gì được gửi tự động."
                : "The assistant drafts from this order and Solenne's policy. You review, edit and send it yourself — nothing is sent automatically."}
            </p>
            <OrderDraftReplyButton
              orderNumber={order.orderNumber}
              country={shipping?.country ?? shipping?.countryCode ?? "Vietnam"}
              locale={locale}
            />
          </div>

          {/* Customer Card */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-normal text-foreground">
                {isVi ? "Thông tin khách hàng" : "Customer"}
              </h2>
            </div>

            <div className="space-y-3 text-sm font-normal">
              <div>
                <div className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Tên khách hàng" : "Name"}
                </div>
                <div className="mt-0.5 font-normal text-foreground">
                  {customerName}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Email" : "Email"}
                </div>
                <div className="mt-0.5 text-foreground truncate">
                  {customerEmail || (
                    <span className="text-muted-foreground italic font-normal">
                      {isVi ? "Chưa cung cấp" : "Not provided"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Số điện thoại" : "Phone"}
                </div>
                <div className="mt-0.5 text-foreground tabular-nums font-normal">
                  {customerPhone || (
                    <span className="text-muted-foreground italic font-normal">
                      {isVi ? "Chưa cung cấp" : "Not provided"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                  {isVi ? "Mã tài khoản" : "Account ID"}
                </div>
                <div className="mt-0.5 tabular-nums text-xs text-muted-foreground truncate font-normal">
                  {order.userId || (
                    <span className="italic font-normal">
                      {isVi ? "Khách vãng lai" : "Guest"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Shipping Address Card */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-normal text-foreground">
                {isVi ? "Địa chỉ giao hàng" : "Shipping Address"}
              </h2>
            </div>

            {shipping ? (
              <div className="space-y-1.5 text-sm text-foreground font-normal">
                <div className="font-normal">{shipping.fullName}</div>
                {shipping.phone && (
                  <div className="text-xs text-muted-foreground tabular-nums font-normal">
                    {shipping.phone}
                  </div>
                )}
                <div className="pt-1 text-muted-foreground space-y-0.5 font-normal">
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
                    <div className="tabular-nums font-normal">{shipping.postalCode}</div>
                  )}
                  <div>
                    {shipping.country || shipping.countryCode || "Vietnam"}
                  </div>
                </div>

                {order.trackingCode && (
                  <div className="pt-3 border-t border-border space-y-1">
                    <div className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
                      {isVi ? "Mã vận đơn" : "Tracking Code"}
                    </div>
                    <div className="tabular-nums text-xs font-normal text-foreground select-all">
                      {order.trackingCode}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic font-normal">
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
