"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  profileSchema,
  type AccountActionState,
  type ProfileInput,
} from "@/lib/validations/account";

export type { AccountActionState };

export async function updateProfileAction(
  input: ProfileInput
): Promise<AccountActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please sign in to manage your profile." };
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
    const admin = createAdminClient();
    const { error: upsertError } = await admin.from("profiles").upsert({
      id: user.id,
      full_name: validated.data.fullName,
      phone: validated.data.phone || null,
      updated_at: new Date().toISOString(),
    });

    if (upsertError) {
      throw new Error(upsertError.message);
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
