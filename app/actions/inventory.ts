"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authErrorState, requirePermission } from "@/lib/authz";
import {
  adjustInventorySchema,
  type AdjustInventoryActionState,
  type AdjustInventoryInput,
} from "@/lib/validations/inventory";

export type { AdjustInventoryActionState };

export async function adjustInventoryAction(
  input: AdjustInventoryInput
): Promise<AdjustInventoryActionState> {
  // 1. Authorization: Requires an active account holding inventory.update
  try {
    await requirePermission("inventory.update");
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to adjust inventory."
    );
  }

  // 2. Validate input
  const validated = adjustInventorySchema.safeParse(input);
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
      error:
        validated.error.issues[0]?.message ||
        "Invalid inventory adjustment input.",
      fieldErrors: flat,
    };
  }

  const { variantId, delta, reason } = validated.data;

  // 3. Call the atomic SECURITY DEFINER RPC on the user-scoped client
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_inventory_stock", {
    p_variant_id: variantId,
    p_delta: delta,
    p_reason: reason.trim(),
  });

  if (error) {
    // Map stable PostgreSQL error codes/messages to human-friendly feedback
    if (error.message.includes("VARIANT_NOT_FOUND")) {
      return { error: "Product variant not found." };
    }
    if (error.message.includes("INSUFFICIENT_STOCK")) {
      return { error: "Insufficient stock: cannot reduce stock below zero." };
    }
    if (error.message.includes("INVALID_DELTA")) {
      return { error: "Adjustment delta cannot be zero." };
    }
    if (error.message.includes("REASON_REQUIRED")) {
      return { error: "Adjustment reason is required (minimum 3 characters)." };
    }
    if (error.message.includes("REASON_INVALID")) {
      return { error: "Adjustment reason cannot exceed 255 characters." };
    }
    if (error.message.includes("FORBIDDEN")) {
      return { error: "You do not have permission to adjust inventory." };
    }
    if (error.message.includes("UNAUTHENTICATED")) {
      return { error: "Please sign in to adjust inventory." };
    }

    console.error("adjustInventoryAction failed:", error);
    return {
      error:
        "Failed to adjust inventory. Please try again or contact support.",
    };
  }

  const result = data as {
    success: boolean;
    variant_id: string;
    sku?: string;
    previous_stock: number;
    new_stock: number;
    delta: number;
  } | null;

  // 4. Revalidate appropriate paths
  revalidatePath("/admin/inventory");
  revalidatePath("/products");
  revalidatePath("/", "layout");

  return {
    success: true,
    variantId: result?.variant_id,
    sku: result?.sku,
    previousStock: result?.previous_stock,
    newStock: result?.new_stock,
    delta: result?.delta,
  };
}
