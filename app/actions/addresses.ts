"use server";

import { revalidatePath } from "next/cache";
import { saveDefaultAddress } from "@/lib/addresses";
import { authErrorState, requirePermission } from "@/lib/authz";
import { findRegion, findLocality } from "@/lib/address-data";
import {
  addressSchema,
  type AccountActionState,
  type AddressInput,
} from "@/lib/validations/account";

export type { AccountActionState };

export async function updateAddressAction(
  input: AddressInput
): Promise<AccountActionState> {
  // Authorization first: session + active status + the self-service
  // permission. The owner of the saved address is always the authenticated
  // session — never a value supplied by the client — and saveDefaultAddress()
  // re-checks ownership against the row it is about to write.
  let userId: string;
  try {
    ({ userId } = await requirePermission("profile.update_own"));
  } catch (error) {
    return authErrorState(error, "Please sign in to edit your address.");
  }

  const validated = addressSchema.safeParse(input);
  if (!validated.success) {
    const flat: Record<string, string[]> = {};
    for (const issue of validated.error.issues) {
      const path = issue.path.join(".");
      if (!flat[path]) {
        flat[path] = [];
      }
      flat[path].push(issue.message);
    }
    return {
      error: "Please check the highlighted fields.",
      fieldErrors: flat,
    };
  }

  // Ensure city / state have display names if administrative codes were selected
  const data = { ...validated.data };
  if (
    data.countryCode === "VN" ||
    data.country === "Vietnam" ||
    data.country === "Việt Nam"
  ) {
    data.country = "Vietnam";
    if (data.provinceCode && (!data.state || data.state === data.provinceCode)) {
      const reg = findRegion("VN", data.provinceCode);
      if (reg) data.state = reg.displayName;
    }
    if (
      data.wardCode &&
      data.provinceCode &&
      (!data.city || data.city === data.wardCode)
    ) {
      const loc = findLocality("VN", data.provinceCode, data.wardCode);
      if (loc) data.city = loc.displayName;
    }
  } else if (
    data.countryCode === "US" ||
    data.country === "United States" ||
    data.country === "Hoa Kỳ"
  ) {
    data.country = "United States";
    if (data.provinceCode && (!data.state || data.state === data.provinceCode)) {
      const reg = findRegion("US", data.provinceCode);
      if (reg) data.state = reg.displayName;
    }
  }

  try {
    await saveDefaultAddress(userId, {
      ...data,
      city: data.city ?? "",
    });
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
