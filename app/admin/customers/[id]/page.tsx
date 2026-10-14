import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Lock,
  Package,
  ShieldAlert,
  ShoppingBag,
  User,
  UserX,
} from "lucide-react";
import { AuthError, requirePermission } from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { getAdminCustomerById } from "@/lib/admin-customers";
import { getOrdersForUser } from "@/lib/orders";
import { formatPrice } from "@/lib/utils";
import { CustomerStatusBadge, CustomerStatusControl } from "@/components/admin";
import { OrderStatusBadge, RestrictedAccountNotice } from "@/components/account";
import { Button } from "@/components/ui";
import type { Order } from "@/types";

export const metadata: Metadata = {
  title: "Customer Details — Administration",
};

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;
  const locale = await getLocale();
  const isVi = locale === "vi";

  let accountRestricted = false;
  let forbiddenAccess = false;
  let loadFailed = false;

  let customer = null;
  let orders: Order[] = [];
  let canReadOrders = false;
  let canManageStaff = false;

  try {
    // 1. Explicit server-side permission check before querying
    const actor = await requirePermission("customer.read");
    canReadOrders = actor.permissions.includes("order.read");
    canManageStaff = actor.permissions.includes("staff.manage");

    // 2. Fetch customer details
    customer = await getAdminCustomerById(id);

    // 3. Fetch order history if caller holds order.read
    if (customer && canReadOrders) {
      try {
        orders = await getOrdersForUser(customer.id, 50);
      } catch (orderErr) {
        console.warn("CustomerDetailPage: Order history fetch warning:", orderErr);
      }
    }
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) {
      redirect(`/login?next=/admin/customers/${id}`);
    }

    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    } else if (error instanceof AuthError) {
      forbiddenAccess = true;
    } else {
      console.error("CustomerDetailPage: Failed to load customer:", error);
      loadFailed = true;
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
              ? "Quý khách không có quyền xem thông tin chi tiết khách hàng."
              : "You do not have permission to view customer details."}
          </p>

          <div className="mt-7 flex justify-center">
            <Button asChild variant="outline">
              <Link href="/admin/customers" className="inline-flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span>
                  {isVi ? "Về danh sách khách hàng" : "Back to Customers"}
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
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Danh sách khách hàng" : "Customers"}</span>
          </Link>
        </nav>

        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium text-destructive">
            {isVi
              ? "Không thể tải hồ sơ khách hàng lúc này. Vui lòng thử lại sau."
              : "Unable to load customer profile at this time. Please try again later."}
          </p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="py-8 space-y-6">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Danh sách khách hàng" : "Back to Customers"}</span>
          </Link>
        </nav>

        <div className="rounded-2xl border border-border p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <UserX className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-serif text-xl font-medium text-foreground">
            {isVi ? "Không tìm thấy khách hàng" : "Customer Not Found"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            {isVi
              ? "Hồ sơ khách hàng này không tồn tại hoặc đã bị xóa."
              : "This customer profile does not exist or has been removed."}
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/admin/customers" className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>{isVi ? "Về danh sách khách hàng" : "Back to Customers"}</span>
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const displayName =
    customer.fullName?.trim() ||
    (isVi ? "Khách hàng ẩn danh" : "Anonymous Member");

  const memberSince = new Date(customer.createdAt).toLocaleDateString(
    isVi ? "vi-VN" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  return (
    <div className="space-y-8 py-4">
      {/* Header and Breadcrumbs */}
      <header className="space-y-4">
        <nav aria-label="Breadcrumb">
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{isVi ? "Danh sách khách hàng" : "Back to Customers"}</span>
          </Link>
        </nav>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl md:text-4xl font-semibold text-foreground">
                {displayName}
              </h1>
              <CustomerStatusBadge status={customer.status} locale={locale} />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">ID: {customer.id}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {isVi ? "Gia nhập: " : "Joined: "}
                  {memberSince}
                </span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Metrics Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ShoppingBag className="h-4 w-4 text-amber" />
            <span>{isVi ? "Tổng số đơn hàng" : "Total Orders"}</span>
          </div>
          {canReadOrders && customer.orderCount !== null ? (
            <div className="text-2xl font-serif font-semibold text-foreground">
              {customer.orderCount}{" "}
              <span className="text-sm font-sans font-normal text-muted-foreground">
                {isVi
                  ? "đơn (không tính đơn hủy)"
                  : "orders (excluding cancelled)"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic pt-1">
              <Lock className="h-3.5 w-3.5" />
              <span>
                {isVi
                  ? "Không khả dụng (giới hạn quyền)"
                  : "Unavailable (restricted)"}
              </span>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Package className="h-4 w-4 text-amber" />
            <span>{isVi ? "Tổng chi tiêu tích lũy" : "Lifetime Spend"}</span>
          </div>
          {canReadOrders && customer.lifetimeSpend !== null ? (
            <div className="text-2xl font-serif font-semibold text-foreground">
              {formatPrice(customer.lifetimeSpend)}{" "}
              <span className="text-sm font-sans font-normal text-muted-foreground">
                {isVi ? "(đã thanh toán / giao vận)" : "(net paid / fulfilled)"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground italic pt-1">
              <Lock className="h-3.5 w-3.5" />
              <span>
                {isVi
                  ? "Không khả dụng (giới hạn quyền)"
                  : "Unavailable (restricted)"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main 2-Column Content: Profile Details (1) + Order History (2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Account Profile Details */}
        <div className="space-y-6">
          {/* Contact & Identity Card */}
          <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-4">
              <User className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-serif text-lg font-medium text-foreground">
                {isVi ? "Thông tin tài khoản" : "Account Information"}
              </h2>
            </div>

            <div className="space-y-3.5 text-sm">
              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground block">
                  {isVi ? "Tên hiển thị" : "Display Name"}
                </span>
                <span className="font-medium text-foreground mt-0.5 block">
                  {displayName}
                </span>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground block">
                  {isVi ? "Số điện thoại" : "Phone"}
                </span>
                <span className="mt-0.5 block font-mono text-xs text-foreground">
                  {customer.phone || (
                    <span className="text-muted-foreground italic font-sans">
                      {isVi ? "Chưa cung cấp" : "Not provided"}
                    </span>
                  )}
                </span>
              </div>

              <div>
                <span className="text-xs uppercase tracking-wider text-muted-foreground block">
                  {isVi ? "Mã định danh" : "Account Identifier"}
                </span>
                <span className="mt-0.5 block font-mono text-xs text-muted-foreground break-all select-all">
                  {customer.id}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Account Status Management (gated by staff.manage) */}
          {canManageStaff && (
            <CustomerStatusControl
              customerId={customer.id}
              currentStatus={customer.status}
              customerName={customer.fullName}
              locale={locale}
            />
          )}
        </div>

        {/* Right 2 Columns: Order History */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card/40 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-serif text-lg font-medium text-foreground">
                  {isVi ? "Lịch sử mua hàng" : "Order History"}
                </h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {orders.length}{" "}
                {isVi ? "đơn gần nhất" : "recent orders"}
              </span>
            </div>

            {!canReadOrders ? (
              <div className="rounded-xl border border-border bg-muted/20 p-6 text-center space-y-2">
                <Lock className="h-5 w-5 text-muted-foreground mx-auto" />
                <p className="text-xs text-muted-foreground">
                  {isVi
                    ? "Cần quyền order.read để xem lịch sử đơn hàng của khách hàng này."
                    : "Viewing order history requires order.read permission."}
                </p>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  {isVi
                    ? "Khách hàng chưa thực hiện đơn hàng nào."
                    : "This customer has not placed any orders yet."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {orders.map((order) => {
                  const itemsCount = order.items.reduce(
                    (sum, i) => sum + i.quantity,
                    0
                  );

                  return (
                    <div
                      key={order.id}
                      className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="font-mono text-sm font-semibold text-foreground hover:text-amber transition-colors"
                          >
                            {order.orderNumber}
                          </Link>
                          <OrderStatusBadge
                            status={order.status}
                            locale={locale}
                          />
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>
                            {new Date(order.createdAt).toLocaleDateString(
                              isVi ? "vi-VN" : "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )}
                          </span>
                          <span>•</span>
                          <span>
                            {itemsCount}{" "}
                            {isVi
                              ? "sản phẩm"
                              : itemsCount === 1
                                ? "item"
                                : "items"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <span className="font-serif font-semibold text-base text-foreground">
                          {formatPrice(order.total)}
                        </span>

                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="h-8 px-2.5 text-xs rounded-lg inline-flex items-center gap-1"
                        >
                          <Link href={`/admin/orders/${order.id}`}>
                            <span>{isVi ? "Chi tiết" : "Manage"}</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
