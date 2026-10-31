import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getDefaultAddress } from "@/lib/addresses";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { Container } from "@/components/ui/container";
import { AddressForm, RestrictedAccountNotice } from "@/components/account";

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

  let address: Awaited<ReturnType<typeof getDefaultAddress>> = null;
  let accountRestricted = false;

  try {
    address = await getDefaultAddress(user.id);
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) redirect("/login");
    if (!isRestrictedAuthError(error)) throw error;
    accountRestricted = true;
  }

  if (accountRestricted) {
    return (
      <div className="py-24 lg:py-32 account-page">
        <Container className="max-w-2xl">
          <RestrictedAccountNotice locale={locale} />
        </Container>
      </div>
    );
  }

  return (
    <div className="py-24 lg:py-32 account-page">
      <Container className="max-w-2xl">
        <nav
          aria-label="Breadcrumb"
          className="mb-8 text-[13px] text-muted-foreground font-normal"
        >
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {isVi ? "Quay lại tài khoản" : "Back to Account"}
          </Link>
        </nav>

        <div className="mb-10">
          <h1 className="font-serif text-2xl sm:text-3xl font-normal leading-[1.22] mb-3 text-foreground tracking-[0.02em]">
            {isVi ? "Địa chỉ giao hàng" : "Shipping address"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed font-normal">
            {isVi
              ? "Địa chỉ mặc định, tự động điền khi thanh toán."
              : "Your default address, filled in automatically at checkout."}
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
