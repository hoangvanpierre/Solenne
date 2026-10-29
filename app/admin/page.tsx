import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import {
  ArrowRight,
  Boxes,
  ChartColumn,
  Clock,
  Layers,
  Package,
  PackageX,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  AuthError,
  requireActiveActor,
  requireAnyPermission,
} from "@/lib/authz";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { MANAGEMENT_PERMISSIONS } from "@/lib/redirect";
import {
  getCustomerMetrics,
  getInventorySnapshot,
  getOrderMetrics,
} from "@/lib/admin-metrics";
import type { PermissionKey, RoleName } from "@/types";
import { Button, Skeleton } from "@/components/ui";
import { RestrictedAccountNotice } from "@/components/account";
import {
  AdminBarChart,
  AdminKpiCard,
  AdminPageHeader,
  AdminStatePanel,
  type AdminBarSegment,
} from "@/components/admin";

export const metadata: Metadata = {
  title: "Administration",
};

// Role-aware management landing page.
//
// The layout above already enforces requireActiveActor() +
// MANAGEMENT_PERMISSIONS, but this page repeats the gate on purpose: layouts
// and pages can render concurrently, so the page never relies on an upstream
// check alone. Nothing below invents a number — every metric comes from
// lib/admin-metrics.ts, which re-checks its own permission and asks the
// database for an exact count.

const ROLE_COPY: Record<
  RoleName,
  { eyebrow: string; eyebrowVi: string; title: string; titleVi: string; description: string; descriptionVi: string }
> = {
  admin: {
    eyebrow: "Solenne Administration",
    eyebrowVi: "Solenne Quản trị",
    title: "Admin Hub",
    titleVi: "Trung tâm quản trị",
    description:
      "Orders, catalogue, inventory, customers and the audit trail at a glance.",
    descriptionVi:
      "Đơn hàng, danh mục, tồn kho, khách hàng và nhật ký kiểm toán trong một góc nhìn.",
  },
  manager: {
    eyebrow: "Solenne Operations Management",
    eyebrowVi: "Solenne Quản lý vận hành",
    title: "Manager Workspace",
    titleVi: "Trung tâm điều hành",
    description:
      "Operational oversight across fulfillment, catalogue, stock and customer records.",
    descriptionVi:
      "Giám sát vận hành đơn hàng, danh mục, tồn kho và hồ sơ khách hàng.",
  },
  staff: {
    eyebrow: "Solenne Operations",
    eyebrowVi: "Solenne Vận hành",
    title: "Operations Workspace",
    titleVi: "Khu vực vận hành",
    description:
      "Daily fulfillment, catalogue maintenance, stock and customer work.",
    descriptionVi:
      "Xử lý đơn hàng, bảo trì danh mục, tồn kho và công việc khách hàng hằng ngày.",
  },
  customer: {
    eyebrow: "Solenne",
    eyebrowVi: "Solenne",
    title: "Admin Hub",
    titleVi: "Trung tâm quản trị",
    description: "The internal management area for Solenne.",
    descriptionVi: "Khu vực quản lý nội bộ của Solenne.",
  },
};

export default async function AdminPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";

  let role: RoleName | null = null;
  let permissions: PermissionKey[] = [];

  try {
    await requireActiveActor();
    const actor = await requireAnyPermission(MANAGEMENT_PERMISSIONS);
    role = actor.role;
    permissions = actor.permissions;
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) redirect("/login?next=/admin");

    if (isRestrictedAuthError(error)) {
      return (
        <div className="py-8">
          <RestrictedAccountNotice locale={locale} />
        </div>
      );
    }

    if (error instanceof AuthError) {
      return (
        <div className="py-8">
          <AdminStatePanel
            title={isVi ? "Khu vực không khả dụng" : "Area unavailable"}
            description={
              isVi
                ? "Khu vực này được dành riêng cho đội ngũ Solenne."
                : "This area is reserved for the Solenne team."
            }
            actions={
              <Button asChild variant="outline">
                <Link href="/">{isVi ? "Về tiệm nến" : "Return to Boutique"}</Link>
              </Button>
            }
          />
        </div>
      );
    }

    throw error;
  }

  const copy = ROLE_COPY[role ?? "customer"];

  const canReadOrders = permissions.includes("order.read");
  const canReadInventory = permissions.includes("inventory.read");
  const canUpdateInventory = permissions.includes("inventory.update");
  const canReadCustomers = permissions.includes("customer.read");
  const canReadAudit = permissions.includes("audit.read");
  const canCancelOrders = permissions.includes("order.cancel");
  const canManageProducts = permissions.some((permission) =>
    ["product.create", "product.update", "product.delete"].includes(permission)
  );

  return (
    <div className="space-y-8 py-8 lg:py-12">
      <AdminPageHeader
        eyebrow={
          <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs uppercase tracking-[0.08em] text-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-amber-dark" aria-hidden="true" />
            <span>{isVi ? copy.eyebrowVi : copy.eyebrow}</span>
          </div>
        }
        title={isVi ? copy.titleVi : copy.title}
        description={isVi ? copy.descriptionVi : copy.description}
      />

      <Suspense fallback={<MetricsSkeleton />}>
        <OverviewMetrics
          locale={locale}
          isVi={isVi}
          canReadOrders={canReadOrders}
          canReadInventory={canReadInventory}
          canReadCustomers={canReadCustomers}
        />
      </Suspense>

      <section aria-labelledby="shortcuts-heading" className="space-y-4">
        <h2
          id="shortcuts-heading"
          className="text-xl font-medium text-foreground"
        >
          {isVi ? "Lối tắt nghiệp vụ" : "Workspace shortcuts"}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {canReadOrders ? (
            <ShortcutCard
              href="/admin/orders"
              icon={Package}
              title={isVi ? "Quản lý đơn hàng" : "Orders"}
              description={
                canCancelOrders
                  ? isVi
                    ? "Xem đơn hàng, cập nhật vận đơn và xử lý hủy đơn."
                    : "Review orders, update fulfillment and handle cancellations."
                  : isVi
                    ? "Xem đơn hàng và cập nhật trạng thái vận đơn."
                    : "Review orders and update fulfillment status."
              }
              action={isVi ? "Truy cập đơn hàng" : "Open orders"}
            />
          ) : null}

          {canManageProducts ? (
            <ShortcutCard
              href="/admin/products"
              icon={Layers}
              title={isVi ? "Quản lý sản phẩm" : "Products"}
              description={
                isVi
                  ? "Xem danh mục, trạng thái hiển thị, nhóm hương và các phiên bản."
                  : "Browse the catalogue, publication status, scent families and variants."
              }
              action={isVi ? "Truy cập sản phẩm" : "Open products"}
            />
          ) : null}

          {canReadInventory ? (
            <ShortcutCard
              href="/admin/inventory"
              icon={Boxes}
              title={isVi ? "Quản lý tồn kho" : "Inventory"}
              description={
                canUpdateInventory
                  ? isVi
                    ? "Theo dõi tồn kho từng phiên bản và ghi nhận điều chỉnh."
                    : "Track stock per variant and record adjustments."
                  : isVi
                    ? "Xem mức tồn kho của từng phiên bản sản phẩm."
                    : "Review stock levels across every variant."
              }
              action={isVi ? "Truy cập tồn kho" : "Open inventory"}
            />
          ) : null}

          {canReadCustomers ? (
            <ShortcutCard
              href="/admin/customers"
              icon={Users}
              title={isVi ? "Quản lý khách hàng" : "Customers"}
              description={
                isVi
                  ? "Mở hồ sơ khách hàng, trạng thái tài khoản và lịch sử mua hàng."
                  : "Open customer records, account status and purchase history."
              }
              action={isVi ? "Truy cập khách hàng" : "Open customers"}
            />
          ) : null}

          {canReadAudit ? (
            <ShortcutCard
              href="/admin/audit"
              icon={ShieldCheck}
              title={isVi ? "Nhật ký kiểm toán" : "Audit trail"}
              description={
                isVi
                  ? "Xem lại các thao tác quản trị đã được ghi nhận."
                  : "Review the administrative actions that have been recorded."
              }
              action={isVi ? "Truy cập nhật ký" : "Open audit trail"}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

interface OverviewMetricsProps {
  locale: string;
  isVi: boolean;
  canReadOrders: boolean;
  canReadInventory: boolean;
  canReadCustomers: boolean;
}

async function OverviewMetrics({
  locale,
  isVi,
  canReadOrders,
  canReadInventory,
  canReadCustomers,
}: OverviewMetricsProps) {
  // Each source fails independently: one unavailable metric group degrades to
  // an inline notice instead of taking down the whole dashboard.
  const [ordersResult, inventoryResult, customersResult] = await Promise.allSettled([
    canReadOrders ? getOrderMetrics() : Promise.resolve(null),
    canReadInventory ? getInventorySnapshot() : Promise.resolve(null),
    canReadCustomers ? getCustomerMetrics() : Promise.resolve(null),
  ]);

  const orders = ordersResult.status === "fulfilled" ? ordersResult.value : null;
  const inventory =
    inventoryResult.status === "fulfilled" ? inventoryResult.value : null;
  const customers =
    customersResult.status === "fulfilled" ? customersResult.value : null;

  const failures: string[] = [];
  if (ordersResult.status === "rejected") {
    failures.push(isVi ? "Chỉ số đơn hàng" : "Order metrics");
  }
  if (inventoryResult.status === "rejected") {
    failures.push(isVi ? "Chỉ số tồn kho" : "Inventory metrics");
  }
  if (customersResult.status === "rejected") {
    failures.push(isVi ? "Chỉ số khách hàng" : "Customer metrics");
  }

  const panelCount = (inventory ? 1 : 0) + (customers ? 1 : 0);

  const formatCount = (value: number) =>
    new Intl.NumberFormat(isVi ? "vi-VN" : "en-US").format(value);

  // ---- Chart 1: order status distribution ---------------------------------
  // Derived from the four counts already resolved above — the chart adds no
  // database round-trip. `otherStatusOrders` is a real remainder, not a clamp:
  // if the buckets disagree with the total it goes negative and the chart
  // reports a data error instead of drawing a plausible-looking bar.
  const otherStatusOrders = orders
    ? orders.total -
      orders.awaitingPayment -
      orders.inFulfillment -
      orders.cancelled
    : 0;

  const orderSegments: AdminBarSegment[] = orders
    ? [
        {
          id: "awaiting-payment",
          label: isVi ? "Chờ thanh toán" : "Awaiting payment",
          value: orders.awaitingPayment,
          tone: "attention",
        },
        {
          id: "in-fulfillment",
          label: isVi ? "Đang xử lý" : "In fulfillment",
          value: orders.inFulfillment,
          tone: "positive",
        },
        {
          id: "cancelled",
          label: isVi ? "Đã hủy" : "Cancelled",
          value: orders.cancelled,
          tone: "danger",
        },
        {
          id: "other-statuses",
          label: isVi
            ? "Trạng thái khác (đã thanh toán/đã giao)"
            : "Other statuses (paid/delivered)",
          value: otherStatusOrders,
          tone: "neutral",
        },
      ]
    : [];

  // ---- Chart 2: inventory stock health ------------------------------------
  // The three buckets are exhaustive and mutually exclusive (getStockStatus),
  // so "healthy" is the remainder of the single inventory read Phase 1 already
  // performs. No additional query.
  const healthyStock = inventory
    ? inventory.variantCount -
      inventory.lowStockCount -
      inventory.outOfStockCount
    : 0;

  const stockSegments: AdminBarSegment[] = inventory
    ? [
        {
          id: "healthy",
          label: isVi ? "Tồn kho tốt" : "Healthy stock",
          value: healthyStock,
          tone: "positive",
        },
        {
          id: "low",
          label: isVi ? "Sắp hết hàng" : "Low stock",
          value: inventory.lowStockCount,
          tone: "attention",
        },
        {
          id: "out",
          label: isVi ? "Hết hàng" : "Out of stock",
          value: inventory.outOfStockCount,
          tone: "danger",
        },
      ]
    : [];

  // ---- Chart 3: customer account restrictions -----------------------------
  // "Not suspended or banned" is deliberately phrased as a negation: the
  // remainder includes both active and pending accounts, so it must never be
  // labelled "active".
  const unrestrictedCustomers = customers
    ? customers.total - customers.restricted
    : 0;

  const customerSegments: AdminBarSegment[] = customers
    ? [
        {
          id: "not-restricted",
          label: isVi
            ? "Không bị tạm ngưng hoặc cấm"
            : "Not suspended or banned",
          value: unrestrictedCustomers,
          tone: "neutral",
        },
        {
          id: "restricted",
          label: isVi ? "Tạm ngưng hoặc bị cấm" : "Suspended or banned",
          value: customers.restricted,
          tone: "danger",
        },
      ]
    : [];

  const orderChartTitle = isVi
    ? "Phân bố trạng thái đơn hàng"
    : "Order status distribution";

  return (
    <section aria-labelledby="metrics-heading" className="space-y-4">
      <h2 id="metrics-heading" className="sr-only">
        {isVi ? "Chỉ số vận hành" : "Operational metrics"}
      </h2>

      {orders ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminKpiCard
            label={isVi ? "Tổng số đơn" : "Total orders"}
            value={orders.total}
            hint={isVi ? "Toàn bộ đơn hàng trong hệ thống" : "Every order in the system"}
            href="/admin/orders"
            icon={Package}
            locale={locale}
          />
          <AdminKpiCard
            label={isVi ? "Chờ thanh toán" : "Awaiting payment"}
            value={orders.awaitingPayment}
            hint={
              isVi
                ? "Chưa bật thanh toán trực tuyến"
                : "Online payment capture is not enabled yet"
            }
            href="/admin/orders"
            icon={Clock}
            tone="attention"
            locale={locale}
          />
          <AdminKpiCard
            label={isVi ? "Đang xử lý" : "In fulfillment"}
            value={orders.inFulfillment}
            hint={isVi ? "Đang xử lý hoặc đang giao" : "Processing or shipped"}
            href="/admin/orders"
            icon={Truck}
            locale={locale}
          />
          <AdminKpiCard
            label={isVi ? "Đã hủy" : "Cancelled"}
            value={orders.cancelled}
            hint={isVi ? "Đơn đã hủy" : "Cancelled orders"}
            href="/admin/orders"
            icon={PackageX}
            tone="danger"
            locale={locale}
          />
        </div>
      ) : inventory ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminKpiCard
            label={isVi ? "Phiên bản theo dõi" : "Variants tracked"}
            value={inventory.variantCount}
            hint={isVi ? "Tổng số phiên bản sản phẩm" : "Product variants in the catalogue"}
            href="/admin/inventory"
            icon={Boxes}
            locale={locale}
          />
          <AdminKpiCard
            label={isVi ? "Sắp hết hàng" : "Low stock"}
            value={inventory.lowStockCount}
            hint={isVi ? "Tồn kho từ 10 trở xuống" : "Ten units or fewer remaining"}
            href="/admin/inventory"
            icon={Boxes}
            tone="attention"
            locale={locale}
          />
          <AdminKpiCard
            label={isVi ? "Hết hàng" : "Out of stock"}
            value={inventory.outOfStockCount}
            hint={isVi ? "Không còn đơn vị nào" : "Nothing left in stock"}
            href="/admin/inventory"
            icon={PackageX}
            tone="danger"
            locale={locale}
          />
        </div>
      ) : null}

      {orders ? (
        <MetricsPanel
          icon={ChartColumn}
          title={orderChartTitle}
          href="/admin/orders"
          linkLabel={isVi ? "Tới đơn hàng" : "Open orders"}
        >
          <AdminBarChart
            label={orderChartTitle}
            segments={orderSegments}
            total={orders.total}
            totalLabel={
              isVi
                ? `${formatCount(orders.total)} đơn hàng`
                : `${formatCount(orders.total)} orders in total`
            }
            emptyMessage={isVi ? "Chưa có đơn hàng nào." : "No orders yet."}
            invalidMessage={
              isVi
                ? "Số liệu đơn hàng không nhất quán. Vui lòng tải lại trang."
                : "Order counts are inconsistent. Please reload the page."
            }
            locale={locale}
            columns={2}
            note={
              isVi
                ? "Trạng thái khác gồm đơn đã thanh toán hoặc đã giao. Chưa bật thanh toán trực tuyến."
                : "Other statuses cover paid or delivered orders. Online payment capture is not enabled yet."
            }
          />
        </MetricsPanel>
      ) : null}

      {failures.length > 0 ? (
        <p
          role="status"
          className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground"
        >
          {isVi ? "Không thể tải: " : "Could not load: "}
          <span className="text-foreground">{failures.join(", ")}</span>
          {isVi
            ? ". Các chỉ số còn lại vẫn chính xác."
            : ". The remaining figures are unaffected."}
        </p>
      ) : null}

      {panelCount > 0 ? (
        <div
          className={
            panelCount > 1 ? "grid gap-4 md:grid-cols-2" : "grid gap-4"
          }
        >
          {inventory ? (
            <MetricsPanel
              icon={Boxes}
              title={isVi ? "Theo dõi tồn kho" : "Stock watch"}
              href="/admin/inventory"
              linkLabel={isVi ? "Tới tồn kho" : "Open inventory"}
            >
              <AdminBarChart
                label={isVi ? "Tình trạng tồn kho" : "Inventory stock health"}
                segments={stockSegments}
                total={inventory.variantCount}
                totalLabel={
                  isVi
                    ? `${formatCount(inventory.variantCount)} phiên bản sản phẩm`
                    : `${formatCount(inventory.variantCount)} product variants`
                }
                emptyMessage={
                  isVi
                    ? "Chưa có phiên bản sản phẩm nào."
                    : "No product variants yet."
                }
                invalidMessage={
                  isVi
                    ? "Số liệu tồn kho không nhất quán. Vui lòng tải lại trang."
                    : "Inventory counts are inconsistent. Please reload the page."
                }
                locale={locale}
                note={
                  isVi
                    ? "Sắp hết hàng là còn 10 đơn vị trở xuống."
                    : "Low stock means ten units or fewer remaining."
                }
              />

              {/* An empty catalogue is already explained by the chart's empty
                  state above, so the restock block only appears when there are
                  variants to restock or to clear. */}
              {inventory.variantCount > 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    {isVi ? "Cần bổ sung" : "Needs restocking"}
                  </p>

                  {inventory.restockCandidates.length > 0 ? (
                    <ul className="mt-2 divide-y divide-border">
                      {inventory.restockCandidates.map((candidate) => (
                        <li
                          key={candidate.variantId}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <span className="min-w-0 truncate text-sm text-foreground">
                            {candidate.productName}
                            <span className="text-muted-foreground">
                              {" · "}
                              {candidate.variantName}
                            </span>
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                            {candidate.stock}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {isVi
                        ? "Mọi phiên bản đều trên ngưỡng sắp hết hàng."
                        : "Every variant is above the low-stock threshold."}
                    </p>
                  )}
                </div>
              ) : null}
            </MetricsPanel>
          ) : null}

          {customers ? (
            <MetricsPanel
              icon={Users}
              title={isVi ? "Cơ sở khách hàng" : "Customer base"}
              href="/admin/customers"
              linkLabel={isVi ? "Tới khách hàng" : "Open customers"}
            >
              <AdminBarChart
                label={
                  isVi
                    ? "Hạn chế tài khoản khách hàng"
                    : "Customer account restrictions"
                }
                segments={customerSegments}
                total={customers.total}
                totalLabel={
                  isVi
                    ? `${formatCount(customers.total)} tài khoản khách hàng`
                    : `${formatCount(customers.total)} customer accounts`
                }
                emptyMessage={
                  isVi
                    ? "Chưa có tài khoản khách hàng nào."
                    : "No customer accounts yet."
                }
                invalidMessage={
                  isVi
                    ? "Số liệu khách hàng không nhất quán. Vui lòng tải lại trang."
                    : "Customer counts are inconsistent. Please reload the page."
                }
                locale={locale}
                note={
                  isVi
                    ? "Tài khoản bị hạn chế là tạm ngưng hoặc bị cấm; phần còn lại gồm cả tài khoản đang hoạt động và đang chờ."
                    : "Restricted accounts are suspended or banned; the remainder includes both active and pending accounts."
                }
              />
            </MetricsPanel>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Presentational pieces (server-rendered, no client state)
// ---------------------------------------------------------------------------

interface MetricsPanelProps {
  icon: LucideIcon;
  title: string;
  href: string;
  linkLabel: string;
  children: React.ReactNode;
}

function MetricsPanel({
  icon: Icon,
  title,
  href,
  linkLabel,
  children,
}: MetricsPanelProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-medium text-foreground">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </h3>

        <Link
          href={href}
          className="admin-quiet-link inline-flex items-center gap-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          {linkLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-4">{children}</div>
    </section>
  );
}

interface ShortcutCardProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  action: string;
}

function ShortcutCard({
  href,
  icon: Icon,
  title,
  description,
  action,
}: ShortcutCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:p-6"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber/15 text-amber-dark"
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="mt-3 text-lg text-foreground">{title}</span>
      <span className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
        {description}
      </span>

      <span className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
        {action}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

function MetricsSkeleton() {
  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-hidden="true"
      >
        <Skeleton className="h-[156px] rounded-2xl" />
        <Skeleton className="h-[156px] rounded-2xl" />
        <Skeleton className="h-[156px] rounded-2xl" />
        <Skeleton className="h-[156px] rounded-2xl" />
      </div>
      <span className="sr-only">
        Loading operational metrics
      </span>
    </div>
  );
}
