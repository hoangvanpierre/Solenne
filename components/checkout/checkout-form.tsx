"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Container } from "@/components/ui/container";
import { useCart } from "@/hooks/use-cart";
import { createOrderAction } from "@/app/actions/orders";

interface CheckoutFormValues {
  email: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
}

interface CheckoutFormDefaultAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

interface CheckoutFormProps {
  defaultEmail: string;
  defaultName: string;
  defaultPhone?: string;
  defaultAddress?: CheckoutFormDefaultAddress;
}

const COUNTRIES = ["United States", "Vietnam"] as const;

export function CheckoutForm({
  defaultEmail,
  defaultName,
  defaultPhone,
  defaultAddress,
}: CheckoutFormProps) {
  const router = useRouter();
  const { items, subtotal, shippingFee, total, format, formatDisplay, currency, clearCart } =
    useCart();

  const [values, setValues] = useState<CheckoutFormValues>({
    email: defaultEmail,
    fullName: defaultName,
    phone: defaultPhone ?? "",
    line1: defaultAddress?.line1 ?? "",
    line2: defaultAddress?.line2 ?? "",
    city: defaultAddress?.city ?? "",
    state: defaultAddress?.state ?? "",
    postalCode: defaultAddress?.postalCode ?? "",
    country:
      defaultAddress?.country &&
      (COUNTRIES as readonly string[]).includes(defaultAddress.country)
        ? defaultAddress.country
        : COUNTRIES[0],
    notes: "",
  });
  const [fieldErrors, setFieldErrors] = useState<
    Record<string, string[] | undefined>
  >({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const errorFor = (key: string) => {
    const errors = fieldErrors[
      key.startsWith("email") || key === "notes" ? key : `shippingAddress.${key}`
    ];
    return errors && errors.length > 0 ? errors[0] : undefined;
  };

  const inputError = (key: string) =>
    errorFor(key) ? { borderColor: "var(--destructive)" } : undefined;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await createOrderAction({
        email: values.email,
        shippingAddress: {
          fullName: values.fullName,
          phone: values.phone,
          line1: values.line1,
          line2: values.line2 || undefined,
          city: values.city,
          state: values.state || undefined,
          postalCode: values.postalCode,
          country: values.country,
        },
        items: items.map((item) => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        })),
        notes: values.notes || undefined,
      });

      if (result.success && result.orderNumber) {
        clearCart();
        router.push(`/checkout/success?number=${result.orderNumber}`);
        return;
      }

      setSubmitError(result.error ?? "Something went wrong. Please try again.");
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
    } catch {
      setSubmitError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <Container className="max-w-3xl">
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground">
            Your cart is empty
          </h1>
          <p className="text-muted-foreground">
            Add a candle or two before checking out.
          </p>
          <Button asChild size="lg" className="mt-2">
            <Link href="/products">Shop the Collection</Link>
          </Button>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mb-10">
        <h1 className="font-serif text-4xl md:text-5xl font-semibold mb-4 text-foreground">
          Checkout
        </h1>
        <p className="text-muted-foreground text-lg">
          Your order is reserved once placed. Payment options are coming soon
          — we&apos;ll be in touch by email to complete payment.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-5">
        {/* Contact & shipping */}
        <form onSubmit={handleSubmit} className="space-y-6 lg:col-span-3" noValidate>
          <section className="rounded-2xl border border-border p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold mb-6 text-foreground">
              Contact
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Input
                label="Email"
                name="email"
                type="email"
                value={values.email}
                onChange={handleChange}
                error={errorFor("email")}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
              <Input
                label="Phone"
                name="phone"
                type="tel"
                value={values.phone}
                onChange={handleChange}
                error={errorFor("phone")}
                placeholder="Your phone number"
                autoComplete="tel"
                required
              />
            </div>
          </section>

          <section className="rounded-2xl border border-border p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold mb-6 text-foreground">
              Shipping Address
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Full Name"
                  name="fullName"
                  value={values.fullName}
                  onChange={handleChange}
                  error={errorFor("fullName")}
                  placeholder="Recipient full name"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Street Address"
                  name="line1"
                  value={values.line1}
                  onChange={handleChange}
                  error={errorFor("line1")}
                  placeholder="House number and street"
                  autoComplete="address-line1"
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  label="Apartment, suite, etc. (optional)"
                  name="line2"
                  value={values.line2}
                  onChange={handleChange}
                  error={errorFor("line2")}
                  placeholder="Apartment, suite, unit"
                  autoComplete="address-line2"
                />
              </div>
              <Input
                label="City"
                name="city"
                value={values.city}
                onChange={handleChange}
                error={errorFor("city")}
                placeholder="City"
                autoComplete="address-level2"
                required
              />
              <Input
                label="State / Province"
                name="state"
                value={values.state}
                onChange={handleChange}
                error={errorFor("state")}
                placeholder="State / Province"
                autoComplete="address-level1"
              />
              <Input
                label="Postal Code"
                name="postalCode"
                value={values.postalCode}
                onChange={handleChange}
                error={errorFor("postalCode")}
                placeholder="Postal code"
                autoComplete="postal-code"
                required
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="country"
                  className="text-sm font-medium text-foreground"
                >
                  Country
                </label>
                <select
                  id="country"
                  name="country"
                  value={values.country}
                  onChange={handleChange}
                  className="flex h-11 w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  style={inputError("country")}
                  required
                >
                  {COUNTRIES.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                {errorFor("country") && (
                  <p className="text-xs text-destructive">
                    {errorFor("country")}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-border p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold mb-6 text-foreground">
              Order Notes (optional)
            </h2>
            <textarea
              name="notes"
              rows={3}
              value={values.notes}
              onChange={handleChange}
              placeholder="Delivery notes, gift messages..."
              className="flex w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm transition-colors duration-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </section>

          {submitError && (
            <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {submitError}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Placing order...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Place Order
              </>
            )}
          </Button>
        </form>

        {/* Order summary */}
        <aside className="lg:col-span-2">
          <div className="rounded-2xl border border-border p-6 sm:p-8">
            <h2 className="font-serif text-xl font-semibold mb-6 text-foreground">
              Order Summary
            </h2>
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={`${item.product.id}-${item.variant.id}`}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.variant.name}
                      {item.variant.size && ` · ${item.variant.size}`} · Qty{" "}
                      {item.quantity}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm text-foreground">
                    {format(item.variant.price * item.quantity)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatDisplay(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>
                  {shippingFee === 0 ? "Free" : formatDisplay(shippingFee)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
                <span>Total</span>
                <span>{formatDisplay(total)}</span>
              </div>
            </div>

            <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
              Totals are shown in {currency}. Your order is placed as{" "}
              <span className="font-medium text-foreground">pending payment</span>{" "}
              and payment can be completed once payment options are enabled.
            </p>
          </div>
        </aside>
      </div>
    </Container>
  );
}
