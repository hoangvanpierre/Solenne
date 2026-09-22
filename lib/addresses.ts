import { createClient } from "@/lib/supabase/server";
import { requireOwnership } from "@/lib/authz";
import type { ShippingAddress } from "@/types";

// ---------------------------------------------------------------------------
// Saved addresses — strictly user-owned data.
//
// Every function here runs on the USER-SCOPED Supabase client, so RLS
// (0003: addresses_select_own / _insert_own / _update_own / _delete_own) is a
// real second gate rather than something the secret key bypasses. The
// application layer additionally requires an active session that owns the row
// and holds the matching self-service permission, so a caller who guesses
// another user's id is rejected before the query is even sent.
// ---------------------------------------------------------------------------

interface AddressRow {
  id: string;
  user_id: string | null;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  is_default: boolean;
  created_at: string;
}

export interface SavedAddress extends ShippingAddress {
  id: string;
  label?: string;
  isDefault: boolean;
}

function mapRow(row: AddressRow): SavedAddress {
  return {
    id: row.id,
    label: row.label ?? undefined,
    fullName: "",
    phone: "",
    line1: row.line1,
    line2: row.line2 ?? undefined,
    city: row.city,
    state: row.state ?? undefined,
    postalCode: row.postal_code,
    country: row.country,
    isDefault: row.is_default,
  };
}

/**
 * The caller's default saved address, or null.
 * `userId` must come from the authenticated session, never from user input.
 */
export async function getDefaultAddress(
  userId: string
): Promise<SavedAddress | null> {
  await requireOwnership(userId, "profile.read_own");

  const supabase = await createClient();
  // Tolerates duplicate default rows (e.g. from a concurrent backfill):
  // takes the first instead of erroring on multiple matches.
  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_default", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw new Error(`Failed to fetch saved address: ${error.message}`);

  if (data && data.length > 0) {
    return mapRow(data[0] as unknown as AddressRow);
  }

  // Backfill for orders placed before saved addresses existed: derive the
  // default address from the user's most recent order and persist it.
  const backfilled = await backfillFromLatestOrder(userId);
  if (backfilled) return backfilled;

  return null;
}

interface OrderAddress extends Partial<ShippingAddress> {
  line1?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

// Reads the caller's own most recent order (RLS: orders_select_own) and
// persists its shipping address as the saved default.
async function backfillFromLatestOrder(
  userId: string
): Promise<SavedAddress | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("shipping_address")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const address = (data as { shipping_address: OrderAddress | null })
    .shipping_address;
  if (
    !address ||
    !address.line1 ||
    !address.city ||
    !address.postalCode ||
    !address.country
  ) {
    return null;
  }

  try {
    await saveDefaultAddress(userId, {
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
    });
  } catch (saveError) {
    console.warn("Failed to persist backfilled address:", saveError);
  }

  return {
    id: "",
    label: "Default",
    fullName: address.fullName ?? "",
    phone: address.phone ?? "",
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: true,
  };
}

/**
 * Upsert the caller's single default address. Keeps one "default" row per
 * user: updates existing default rows when present, otherwise inserts one.
 * `userId` must come from the authenticated session, never from user input.
 */
export async function saveDefaultAddress(
  userId: string,
  address: Omit<ShippingAddress, "fullName" | "phone"> & {
    fullName?: string;
    phone?: string;
  }
): Promise<void> {
  await requireOwnership(userId, "profile.update_own");

  const supabase = await createClient();

  const values = {
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    state: address.state ?? null,
    postal_code: address.postalCode,
    country: address.country,
  };

  const { data: existing, error: fetchError } = await supabase
    .from("addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true);

  if (fetchError) {
    throw new Error(`Failed to look up saved address: ${fetchError.message}`);
  }

  if (existing && existing.length > 0) {
    // Update every default row to the same values — self-heals any
    // duplicates created by concurrent requests.
    const { error: updateError } = await supabase
      .from("addresses")
      .update(values)
      .in(
        "id",
        existing.map((row) => (row as { id: string }).id)
      );

    if (updateError) {
      throw new Error(`Failed to update saved address: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase.from("addresses").insert({
    user_id: userId,
    label: "Default",
    is_default: true,
    ...values,
  });

  if (insertError) {
    throw new Error(`Failed to save address: ${insertError.message}`);
  }
}

