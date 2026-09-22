"use server";

import { revalidatePath } from "next/cache";
import { authErrorState, requirePermission } from "@/lib/authz";
import { createOrder, OrderError } from "@/lib/orders";
import { findRegion, findLocality } from "@/lib/address-data";
import {
  checkoutSchema,
  type CheckoutActionState,
  type CheckoutInput,
} from "@/lib/validations/order";

export type { CheckoutActionState };

export async function createOrderAction(
  input: CheckoutInput
): Promise<CheckoutActionState> {
  // Authorization first: session + active account status + order.create.
  // The owner of the order is always the authenticated session — never a
  // value supplied by the client.
  let userId: string;
  try {
    ({ userId } = await requirePermission("order.create"));
  } catch (error) {
    return authErrorState(error, "Please sign in to place an order.");
  }

  const validated = checkoutSchema.safeParse(input);
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
      error: "Please check your shipping details.",
      fieldErrors: flat,
    };
  }

  // Ensure city / state have resolved display names and administrative metadata
  const shippingAddress = { ...validated.data.shippingAddress };
  if (
    shippingAddress.countryCode === "VN" ||
    shippingAddress.country === "Vietnam" ||
    shippingAddress.country === "Việt Nam"
  ) {
    shippingAddress.country = "Vietnam";
    if (
      shippingAddress.provinceCode &&
      (!shippingAddress.state || shippingAddress.state === shippingAddress.provinceCode)
    ) {
      const reg = findRegion("VN", shippingAddress.provinceCode);
      if (reg) {
        shippingAddress.state = reg.displayName;
        shippingAddress.provinceName = reg.displayName;
      }
    }
    if (
      shippingAddress.wardCode &&
      shippingAddress.provinceCode &&
      (!shippingAddress.city || shippingAddress.city === shippingAddress.wardCode)
    ) {
      const loc = findLocality("VN", shippingAddress.provinceCode, shippingAddress.wardCode);
      if (loc) {
        shippingAddress.city = loc.displayName;
        shippingAddress.wardName = loc.displayName;
        shippingAddress.administrativeType = loc.administrativeType;
      }
    }
  } else if (
    shippingAddress.countryCode === "US" ||
    shippingAddress.country === "United States" ||
    shippingAddress.country === "Hoa Kỳ"
  ) {
    shippingAddress.country = "United States";
    if (
      shippingAddress.provinceCode &&
      (!shippingAddress.state || shippingAddress.state === shippingAddress.provinceCode)
    ) {
      const reg = findRegion("US", shippingAddress.provinceCode);
      if (reg) {
        shippingAddress.state = reg.displayName;
        shippingAddress.provinceName = reg.displayName;
      }
    }
  }

  try {
    const order = await createOrder({
      userId,
      email: validated.data.email,
      shippingAddress: {
        ...shippingAddress,
        city: shippingAddress.city ?? "",
      },
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
