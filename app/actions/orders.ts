"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

export interface CancelOrderActionState {
  success?: boolean;
  orderNumber?: string;
  error?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function cancelOrderAction(
  orderId: string,
  reason?: string
): Promise<CancelOrderActionState> {
  // 1. Authenticate and enforce authorization at the application layer:
  // Requires an active account holding order.cancel (Manager/Admin only).
  try {
    await requirePermission("order.cancel");
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to cancel orders."
    );
  }

  // 2. Validate order ID format before issuing database calls
  if (!orderId || !UUID_REGEX.test(orderId)) {
    return { error: "Invalid order identifier." };
  }

  // 3. Invoke the trusted atomic cancellation RPC via the user-scoped client
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_order", {
    p_order_id: orderId,
    p_reason: reason?.trim() || null,
  });

  if (error) {
    // Map stable PostgreSQL error codes/messages to human-friendly feedback
    if (error.message.includes("ORDER_ALREADY_CANCELLED")) {
      return { error: "This order has already been cancelled." };
    }
    if (error.message.includes("ORDER_NOT_FOUND")) {
      return { error: "Order not found." };
    }
    if (error.message.includes("ORDER_STATUS_NOT_CANCELLABLE")) {
      return {
        error:
          "This order cannot be cancelled in its current fulfillment status.",
      };
    }
    if (error.message.includes("VARIANT_NOT_FOUND")) {
      return {
        error:
          "Unable to restore inventory: one or more product variants no longer exist.",
      };
    }
    if (error.message.includes("FORBIDDEN")) {
      return { error: "You do not have permission to cancel orders." };
    }
    if (error.message.includes("UNAUTHENTICATED")) {
      return { error: "Please sign in to cancel orders." };
    }

    console.error("cancelOrderAction failed:", error);
    return {
      error: "Failed to cancel order. Please try again or contact support.",
    };
  }

  const result = data as {
    success: boolean;
    order_number?: string;
  } | null;

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/account/orders");

  return {
    success: true,
    orderNumber: result?.order_number,
  };
}
