"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authErrorState, requirePermission } from "@/lib/authz";
import {
  customerStatusChangeSchema,
  customerReinstatementSchema,
  type CustomerStatusActionState,
  type CustomerStatusChangeInput,
  type CustomerReinstatementActionState,
  type CustomerReinstatementInput,
} from "@/lib/validations/customer";
import type { AccountStatus } from "@/types";

export type {
  CustomerStatusActionState,
  CustomerStatusChangeInput,
  CustomerReinstatementActionState,
  CustomerReinstatementInput,
};

export async function manageCustomerStatusAction(
  input: CustomerStatusChangeInput
): Promise<CustomerStatusActionState> {
  // 1. Authorization: Requires an active account holding staff.manage (admin only)
  try {
    await requirePermission("staff.manage");
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to manage customer accounts."
    );
  }

  // 2. Validate input schema & transition constraints
  const validated = customerStatusChangeSchema.safeParse(input);
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
        "Invalid customer status transition request.",
      fieldErrors: flat,
    };
  }

  const { customerId, targetStatus, reason } = validated.data;

  // 3. Call atomic database RPC on the user-scoped client
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("manage_customer_status", {
    p_customer_id: customerId,
    p_target_status: targetStatus,
    p_reason: reason.trim(),
  });

  if (error) {
    // Map stable PostgreSQL error codes/messages to human-friendly feedback
    if (error.message.includes("CUSTOMER_NOT_FOUND")) {
      return { error: "Customer profile not found." };
    }
    if (error.message.includes("INVALID_TARGET_ROLE")) {
      return {
        error: "Only customer accounts can be managed through this interface.",
      };
    }
    if (error.message.includes("SELF_STATUS_CHANGE_FORBIDDEN")) {
      return { error: "You cannot change the status of your own account." };
    }
    if (error.message.includes("NOOP_TRANSITION")) {
      return { error: "Customer is already in the requested status." };
    }
    if (error.message.includes("BANNED_STATUS_TERMINAL")) {
      return {
        error: "Banned accounts cannot be reactivated or modified.",
      };
    }
    if (error.message.includes("PENDING_STATUS_UNSUPPORTED")) {
      return { error: "Pending accounts cannot be transitioned." };
    }
    if (error.message.includes("INVALID_STATUS_TRANSITION")) {
      return { error: "This status transition is not permitted." };
    }
    if (
      error.message.includes("INVALID_REASON") ||
      error.message.includes("REASON_REQUIRED")
    ) {
      return {
        error: "A valid reason between 5 and 255 characters is required.",
      };
    }
    if (error.message.includes("INVALID_TARGET_STATUS")) {
      return { error: "Invalid target account status." };
    }
    if (error.message.includes("FORBIDDEN")) {
      return {
        error: "You do not have permission to manage customer accounts.",
      };
    }
    if (error.message.includes("UNAUTHENTICATED")) {
      return { error: "Please sign in to manage customer accounts." };
    }

    console.error("manageCustomerStatusAction failed:", error);
    return {
      error:
        "Failed to update customer status. Please try again or contact support.",
    };
  }

  const result = data as {
    success: boolean;
    customer_id: string;
    old_status: AccountStatus;
    new_status: AccountStatus;
  } | null;

  // 4. Revalidate customer views
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);

  return {
    success: true,
    customerId: result?.customer_id ?? customerId,
    previousStatus: result?.old_status,
    newStatus: result?.new_status ?? (targetStatus as AccountStatus),
  };
}

export async function reinstateCustomerAction(
  input: CustomerReinstatementInput
): Promise<CustomerReinstatementActionState> {
  // 1. Authorization: Requires an active account holding staff.manage (admin only)
  try {
    await requirePermission("staff.manage");
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to reinstate customer accounts."
    );
  }

  // 2. Validate input schema
  const validated = customerReinstatementSchema.safeParse(input);
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
        "Invalid customer reinstatement request.",
      fieldErrors: flat,
    };
  }

  const { customerId, reason } = validated.data;

  // 3. Call atomic database RPC on the user-scoped client
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reinstate_banned_customer", {
    p_customer_id: customerId,
    p_reason: reason.trim(),
  });

  if (error) {
    // Map stable PostgreSQL error codes/messages to human-friendly feedback
    if (error.message.includes("CUSTOMER_NOT_FOUND")) {
      return { error: "Customer profile not found." };
    }
    if (error.message.includes("INVALID_TARGET_ROLE")) {
      return {
        error: "Only customer accounts can be reinstated through this interface.",
      };
    }
    if (error.message.includes("SELF_REINSTATEMENT_FORBIDDEN")) {
      return { error: "You cannot reinstate your own account." };
    }
    if (error.message.includes("CUSTOMER_NOT_BANNED")) {
      return {
        error: "Only banned customer accounts can be reinstated.",
      };
    }
    if (
      error.message.includes("INVALID_REASON") ||
      error.message.includes("REASON_REQUIRED")
    ) {
      return {
        error: "A valid reason between 5 and 255 characters is required.",
      };
    }
    if (error.message.includes("INVALID_CUSTOMER_ID")) {
      return { error: "Invalid customer ID format." };
    }
    if (error.message.includes("FORBIDDEN")) {
      return {
        error: "You do not have permission to reinstate customer accounts.",
      };
    }
    if (error.message.includes("UNAUTHENTICATED")) {
      return { error: "Please sign in to reinstate customer accounts." };
    }

    console.error("reinstateCustomerAction failed:", error);
    return {
      error:
        "Failed to reinstate customer account. Please try again or contact support.",
    };
  }

  const result = data as {
    success: boolean;
    customer_id: string;
    old_status: AccountStatus;
    new_status: AccountStatus;
  } | null;

  // 4. Revalidate customer views
  revalidatePath("/admin/customers");
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/audit");

  return {
    success: true,
    customerId: result?.customer_id ?? customerId,
    previousStatus: result?.old_status ?? "banned",
    newStatus: result?.new_status ?? "active",
  };
}
