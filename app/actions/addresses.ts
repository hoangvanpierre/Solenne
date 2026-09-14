"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { saveDefaultAddress } from "@/lib/addresses";
import {
  addressSchema,
  type AccountActionState,
  type AddressInput,
} from "@/lib/validations/account";

export type { AccountActionState };

export async function updateAddressAction(
  input: AddressInput
): Promise<AccountActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please sign in to edit your address." };
  }

  const validated = addressSchema.safeParse(input);
  if (!validated.success) {
    const flat: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(
      validated.error.flatten().fieldErrors as Record<string, unknown>
    )) {
      if (Array.isArray(value)) {
        flat[key] = value as string[];
      }
    }
    return {
      error: "Please check the highlighted fields.",
      fieldErrors: flat,
    };
  }

  try {
    await saveDefaultAddress(user.id, validated.data);
  } catch (error) {
    console.error("Failed to save address:", error);
    return {
      error:
        "We couldn't save your address. Please try again, or contact us if the problem persists.",
    };
  }

  revalidatePath("/account");
  revalidatePath("/account/address");

  return { success: true };
}
