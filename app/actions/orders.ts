"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createOrder, OrderError } from "@/lib/orders";
import {
  checkoutSchema,
  type CheckoutActionState,
  type CheckoutInput,
} from "@/lib/validations/order";

export type { CheckoutActionState };

export async function createOrderAction(
  input: CheckoutInput
): Promise<CheckoutActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Please sign in to place an order." };
  }

  const validated = checkoutSchema.safeParse(input);
  if (!validated.success) {
    const flat: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(
      validated.error.flatten().fieldErrors as Record<string, unknown>
    )) {
      if (Array.isArray(value)) {
        flat[key] = value as string[];
      } else if (value && typeof value === "object") {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (Array.isArray(nestedValue)) {
            flat[`${key}.${nestedKey}`] = nestedValue as string[];
          }
        }
      }
    }
    return {
      error: "Please check your shipping details.",
      fieldErrors: flat,
    };
  }

  try {
    const order = await createOrder({
      userId: user.id,
      email: validated.data.email,
      shippingAddress: validated.data.shippingAddress,
      items: validated.data.items,
      notes: validated.data.notes,
    });

    revalidatePath("/account");
    revalidatePath("/products");

    return { success: true, orderNumber: order.orderNumber };
  } catch (error) {
    if (error instanceof OrderError) {
      return { error: error.message };
    }
    console.error("Order creation failed:", error);
    return {
      error:
        "We couldn't place your order. Please try again, or contact us if the problem persists.",
    };
  }
}
