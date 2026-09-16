import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDefaultAddress } from "@/lib/addresses";
import { Container } from "@/components/ui/container";
import { AddressForm } from "@/components/account";

export const metadata: Metadata = {
  title: "Edit Shipping Address — Solenne",
  description: "Update your saved Solenne shipping address.",
};

export default async function AddressPage() {
  const locale = await getLocale();
  const isVi = locale === "vi";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const address = await getDefaultAddress(user.id);

  return (
    <div className="py-24 lg:py-32">
      <Container className="max-w-2xl">
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
            {isVi ? "Địa Chỉ An Nhận" : "Shipping Address"}
          </h1>
          <p className="text-lg text-muted-foreground">
            {isVi
              ? "Điểm đến mặc định của quý khách, tự động điền khi thỉnh nến."
              : "Your default destination, filled in automatically at checkout."}
          </p>
        </div>

        <AddressForm
          defaultValues={
            address
              ? {
                  line1: address.line1,
                  line2: address.line2,
                  city: address.city,
                  state: address.state,
                  postalCode: address.postalCode,
                  country: address.country,
                }
              : undefined
          }
        />
      </Container>
    </div>
  );
}
