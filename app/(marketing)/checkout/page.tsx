import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getDefaultAddress } from "@/lib/addresses";
import {
  isRestrictedAuthError,
  isUnauthenticatedAuthError,
} from "@/lib/authz-ux";
import { CheckoutForm } from "@/components/checkout";
import { RestrictedAccountNotice } from "@/components/account";
import { Container } from "@/components/ui/container";
import type { SavedAddress } from "@/lib/addresses";

export const metadata: Metadata = {
  title: "Checkout — Solenne",
  description:
    "Review your order and shipping details to place your Solenne order.",
};

export default async function CheckoutPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone")
    .eq("id", user.id)
    .single();

  let savedAddress: SavedAddress | null = null;
  let accountRestricted = false;
  try {
    savedAddress = await getDefaultAddress(user.id);
  } catch (error) {
    if (isUnauthenticatedAuthError(error)) redirect("/login");
    if (isRestrictedAuthError(error)) {
      accountRestricted = true;
    }
    // Any other failure keeps the pre-existing behavior: checkout proceeds
    // without a saved address rather than blocking the page.
  }

  if (accountRestricted) {
    return (
      <div className="py-24 lg:py-32">
        <Container className="max-w-2xl">
          <RestrictedAccountNotice locale={locale} />
        </Container>
      </div>
    );
  }

  return (
    <div className="py-24 lg:py-32">
      <CheckoutForm
        defaultEmail={user.email ?? ""}
        defaultName={
          savedAddress?.fullName ||
          profile?.full_name ||
          user.user_metadata?.full_name ||
          ""
        }
        defaultPhone={profile?.phone || savedAddress?.phone || ""}
        defaultAddress={savedAddress ?? undefined}
      />
    </div>
  );
}
