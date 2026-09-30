import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { ArrowRight, Boxes, Package, ShieldCheck, UserCheck } from "lucide-react";
import { getActorContext } from "@/lib/authz";
import { Button } from "@/components/ui";

export const metadata: Metadata = {
  title: "Administration",
};

// Role-aware management landing page. The layout above enforces the
// server-side authorization boundary (requireActiveActor + MANAGEMENT_PERMISSIONS),
// so this page presents role-appropriate context and capability links governed
// by the actor's permissions.
export default async function AdminPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";
  const actor = await getActorContext();

  const role = actor?.role;
  const canReadOrders = actor?.permissions.includes("order.read") ?? false;
  const canCancelOrders = actor?.permissions.includes("order.cancel") ?? false;
  const canReadInventory = actor?.permissions.includes("inventory.read") ?? false;
  const canUpdateInventory = actor?.permissions.includes("inventory.update") ?? false;

  let badgeLabel = isVi ? "Solenne Quản trị" : "Solenne Administration";
  let title = isVi ? "Trung tâm quản trị" : "Admin Hub";
  let description = isVi
    ? "Khu vực quản lý nội bộ của Solenne."
    : "The internal management area for Solenne.";

  if (role === "staff") {
    badgeLabel = isVi ? "Solenne Vận hành" : "Solenne Operations";
    title = isVi ? "Khu vực vận hành" : "Operations Workspace";
    description = isVi
      ? "Quản lý đơn hàng và tác nghiệp thường nhật."
      : "Order fulfillment and daily operational tasks.";
  } else if (role === "manager") {
    badgeLabel = isVi ? "Solenne Quản lý" : "Solenne Operations Management";
    title = isVi ? "Trung tâm điều hành" : "Manager Workspace";
    description = isVi
      ? "Giám sát vận hành đơn hàng, xử lý hủy đơn và quản trị nghiệp vụ."
      : "Operational oversight, fulfillment control, and store management.";
  }

  return (
    <div className="py-8 lg:py-12 space-y-8">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber/30 bg-amber/10 text-amber text-xs tracking-wider uppercase font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{badgeLabel}</span>
        </div>
        <h1 className="font-serif text-4xl md:text-5xl font-semibold text-foreground">
          {title}
        </h1>
        <p className="text-lg text-muted-foreground">
          {description}
        </p>
      </header>

      {/* Available Management Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        {canReadOrders && (
          <div className="rounded-2xl border border-border bg-card/40 p-6 flex flex-col justify-between space-y-4 hover:border-amber/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber/10 text-amber">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-medium text-foreground">
                    {isVi ? "Quản lý đơn hàng" : "Orders Management"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {canCancelOrders
                      ? isVi
                        ? "Xem đơn, vận đơn và kiểm soát hủy đơn"
                        : "View orders, tracking, and cancellation controls"
                      : isVi
                        ? "Xem danh sách và cập nhật vận đơn"
                        : "View orders and update tracking"}
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                {isVi
                  ? "Theo dõi tiến độ đơn hàng toàn hệ thống, xử lý cập nhật trạng thái giao vận và kiểm tra thông tin khách hàng."
                  : "Track system-wide orders, perform status and fulfillment transitions, and inspect customer details."}
              </p>
            </div>

            <div className="pt-2">
              <Button asChild variant="outline" className="w-full sm:w-auto inline-flex items-center gap-2">
                <Link href="/admin/orders">
                  <span>{isVi ? "Truy cập đơn hàng" : "Open Orders"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {canReadInventory && (
          <div className="rounded-2xl border border-border bg-card/40 p-6 flex flex-col justify-between space-y-4 hover:border-amber/40 transition-colors">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber/10 text-amber">
                  <Boxes className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-medium text-foreground">
                    {isVi ? "Quản lý tồn kho" : "Inventory Management"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {canUpdateInventory
                      ? isVi
                        ? "Theo dõi và điều chỉnh mức tồn kho"
                        : "Monitor and adjust variant stock levels"
                      : isVi
                        ? "Xem dữ liệu tồn kho toàn hệ thống"
                        : "View system-wide inventory data"}
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                {isVi
                  ? "Kiểm soát số lượng tồn kho từng phiên bản sản phẩm, nhận diện các tác phẩm sắp hết hàng và thực hiện cập nhật kho an toàn."
                  : "Track stock quantities across all product variants, monitor low-stock thresholds, and perform atomic inventory adjustments."}
              </p>
            </div>

            <div className="pt-2">
              <Button asChild variant="outline" className="w-full sm:w-auto inline-flex items-center gap-2">
                <Link href="/admin/inventory">
                  <span>{isVi ? "Truy cập tồn kho" : "Open Inventory"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )}

        {role === "admin" && (
          <div className="rounded-2xl border border-border bg-card/40 p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-serif text-xl font-medium text-foreground">
                    {isVi ? "Hệ thống quản trị" : "System Administration"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {isVi ? "Quyền quản trị cấp cao" : "Superuser authorization"}
                  </p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">
                {isVi
                  ? "Tài khoản của quý khách sở hữu toàn quyền quản trị, bao gồm kiểm soát phân quyền RBAC và xem nhật ký bảo mật."
                  : "Your account holds full administrative authority, including RBAC permission management and security audit inspection."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
