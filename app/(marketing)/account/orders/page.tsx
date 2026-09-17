import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOrdersForUser } from "@/lib/orders";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrderListItem } from "@/components/account";
import type { Order } from "@/types";

export const metadata: Metadata = {
  title: "Order History — Solenne",
  description:
    "Every Solenne order you've placed, most recent first, with status and receipt links.",
};

const ORDERS_PAGE_LIMIT = 50;

async function OrdersList({ userId, locale }: { userId: string; locale: string }) {
  const isVi = locale === "vi";
  let orders: Order[] = [];
  let loadFailed = false;

  try {
    orders = await getOrdersForUser(userId, ORDERS_PAGE_LIMIT);
  } catch (error) {
    console.error("Failed to load order history:", error);
    loadFailed = true;
  }

  if (loadFailed) {
    return (
      <p className="rounded-2xl border border-border p-6 text-base text-muted-foreground">
        {isVi ? (
          <>
            Chưa thể tải lịch sử đơn hàng lúc này. Quý khách vui lòng tải lại trang hoặc{" "}
            <Link
              href="/contact"
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              liên hệ chúng tôi
            </Link>{" "}
            nếu sự cố tiếp tục tái diễn.
          </>
        ) : (
          <>
            We couldn&apos;t load your orders right now. Please refresh the page,
            or{" "}
            <Link
              href="/contact"
              className="underline underline-offset-4 transition-colors hover:text-foreground"
            >
              contact us
            </Link>{" "}
            if the problem persists.
          </>
        )}
      </p>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border py-16 text-center">
        <Package className="h-10 w-10 text-muted-foreground" />
        <p className="font-serif text-2xl font-medium text-foreground">
          {isVi ? "Chưa có đơn hàng nào" : "No orders yet"}
        </p>
        <p className="text-sm text-muted-foreground">
          {isVi
            ? "Các tác phẩm nến thơm của quý khách sẽ xuất hiện tại đây."
            : "Your candle orders will appear here."}
        </p>
        <Button asChild size="sm" className="mt-2">
          <Link
            href="/products"
            className="inline-flex items-center gap-2"
          >
            <span>{isVi ? "Khám phá bộ sưu tập" : "Explore Collection"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderListItem key={order.id} order={order} locale={locale} />
      ))}
    </div>
  );
}

function OrdersListSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}

export default async function OrdersPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="py-24 lg:py-32 account-page">
      <Container className="max-w-3xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-sm text-muted-foreground"
        >
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isVi ? "Quay lại không gian cá nhân" : "Back to Account"}
          </Link>
        </nav>

        <div className="mb-10">
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            {isVi ? "Lịch Sử Đơn Hàng" : "Order History"}
          </h1>
          <p className="text-lg text-muted-foreground">
            {isVi
              ? "Tất cả các tác phẩm quý khách đã từng thỉnh, mới nhất trước."
              : "Every order you've placed, most recent first."}
          </p>
        </div>

        <Suspense fallback={<OrdersListSkeleton />}>
          <OrdersList userId={user.id} locale={locale} />
        </Suspense>
      </Container>
    </div>
  );
}
