"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authErrorState, requirePermission } from "@/lib/authz";
import {
  profileSchema,
  type AccountActionState,
  type ProfileInput,
} from "@/lib/validations/account";

export type { AccountActionState };

export async function updateProfileAction(
  input: ProfileInput
): Promise<AccountActionState> {
  // Self-service profile edit: any active account may update its own name and
  // phone. Role, status and id are never accepted from the client.
  let userId: string;
  try {
    ({ userId } = await requirePermission("profile.update_own"));
  } catch (error) {
    return authErrorState(
      error,
      "Please sign in to manage your profile."
    );
  }

  const validated = profileSchema.safeParse(input);
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
    // User-scoped write: RLS (profiles_update_own) limits the statement to the
    // caller's own row, and the profiles_guard_privileges trigger from 0001
    // rejects any attempt to touch role_id / status from this path. The
    // payload is limited to the two columns a client may change, so a forged
    // field cannot promote or reactivate an account.
    const supabase = await createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: validated.data.fullName,
        phone: validated.data.phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } catch (error) {
    console.error("Failed to update profile:", error);
    return {
      error:
        "We couldn't save your profile. Please try again, or contact us if the problem persists.",
    };
  }

  revalidatePath("/account");
  revalidatePath("/account/profile");
  revalidatePath("/checkout");

  return { success: true };
}

