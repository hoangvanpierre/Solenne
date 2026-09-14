import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Package, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { getOrderByNumber } from "@/lib/orders";
import { CONTACT_EMAIL } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Order Confirmed — Solenne",
  description: "Your Solenne order has been placed.",
};

interface CheckoutSuccessPageProps {
  searchParams: Promise<{ number?: string }>;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const { number } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const order = number ? await getOrderByNumber(number, user.id) : null;

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-sage/20">
            <CheckCircle2 className="h-8 w-8 text-sage" />
          </div>
          <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
            Thank you for your order
          </h1>
          {order && (
            <p className="text-muted-foreground text-lg">
              Order{" "}
              <span className="font-medium text-foreground">
                {order.orderNumber}
              </span>{" "}
              is confirmed and reserved.
            </p>
          )}
        </div>

        {order ? (
          <>
            <div className="rounded-2xl border border-border p-6 sm:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-border pb-6">
                <div className="flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Status:</span>
                  <span className="rounded-full border border-amber/30 bg-amber/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-amber">
                    Pending Payment
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>

              <div className="space-y-4">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.variantName}
                        {item.variantName ? " · " : ""}Qty {item.quantity}
                      </p>
                    </div>
                    <p className="whitespace-nowrap text-sm text-foreground">
                      {formatPrice(item.totalPrice)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(order.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>
                    {order.shippingFee === 0
                      ? "Free"
                      : formatPrice(order.shippingFee)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                  <span>Total</span>
                  <span>{formatPrice(order.total)}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-border p-6 text-sm">
                <h2 className="mb-3 font-serif text-lg font-semibold text-foreground">
                  Shipping to
                </h2>
                <p className="text-muted-foreground">
                  {order.shippingAddress.fullName}
                  <br />
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 && (
                    <>
                      <br />
                      {order.shippingAddress.line2}
                    </>
                  )}
                  <br />
                  {order.shippingAddress.city}
                  {order.shippingAddress.state && `, ${order.shippingAddress.state}`}{" "}
                  {order.shippingAddress.postalCode}
                  <br />
                  {order.shippingAddress.country}
                </p>
              </div>
              <div className="rounded-2xl border border-border p-6 text-sm">
                <h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
                  <Mail className="h-4 w-4" />
                  Next step
                </h2>
                <p className="leading-relaxed text-muted-foreground">
                  Online payment is on its way. Until it&apos;s enabled, your
                  order is safely reserved — we&apos;ll email{" "}
                  <span className="font-medium text-foreground">
                    {order.shippingAddress.email ?? user.email}
                  </span>{" "}
                  with payment instructions, or you can reach us anytime at{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
              </div>
            </div>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/products">Continue Shopping</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/account">View My Orders</Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-border p-10 text-center">
            <p className="text-muted-foreground">
              We couldn&apos;t find that order. If you believe this is a
              mistake, contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href="/account">View My Orders</Link>
            </Button>
          </div>
        )}
      </Container>
    </div>
  );
}
