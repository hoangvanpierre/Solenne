import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getDefaultAddress } from "@/lib/addresses";
import { CheckoutForm } from "@/components/checkout";
import type { SavedAddress } from "@/lib/addresses";

export const metadata: Metadata = {
  title: "Checkout — Solenne",
  description:
    "Review your order and shipping details to place your Solenne order.",
};

export default async function CheckoutPage() {
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
  try {
    savedAddress = await getDefaultAddress(user.id);
  } catch {
    // A missing saved address should never block checkout.
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
