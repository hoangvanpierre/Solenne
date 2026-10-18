import { z } from "zod";
import { isValidUuid } from "@/lib/audit-utils";
import type { AccountStatus } from "@/types";

export const ALLOWED_MANAGEABLE_STATUSES = [
  "active",
  "suspended",
  "banned",
] as const;

export type ManageableAccountStatus = (typeof ALLOWED_MANAGEABLE_STATUSES)[number];

export const customerStatusChangeSchema = z
  .object({
    customerId: z.string().refine(isValidUuid, {
      message: "Invalid customer ID format.",
    }),
    currentStatus: z.enum(["active", "suspended", "banned", "pending"], {
      message: "Invalid current status.",
    }),
    targetStatus: z.enum(["active", "suspended", "banned"], {
      message: "Target status must be active, suspended, or banned.",
    }),
    reason: z
      .string()
      .trim()
      .min(5, "Reason must be at least 5 characters.")
      .max(255, "Reason cannot exceed 255 characters."),
  })
  .superRefine((data, ctx) => {
    const { currentStatus, targetStatus } = data;

    if (currentStatus === targetStatus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetStatus"],
        message: `Customer is already in ${targetStatus} status.`,
      });
      return;
    }

    if (currentStatus === "banned") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetStatus"],
        message: "Banned status is terminal and cannot be modified.",
      });
      return;
    }

    if (currentStatus === "pending") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetStatus"],
        message: "Pending customer accounts cannot be transitioned with this action.",
      });
      return;
    }

    const validTransitions: Record<string, string[]> = {
      active: ["suspended", "banned"],
      suspended: ["active", "banned"],
    };

    if (!validTransitions[currentStatus]?.includes(targetStatus)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["targetStatus"],
        message: `Transition from ${currentStatus} to ${targetStatus} is not permitted.`,
      });
    }
  });

export type CustomerStatusChangeInput = z.infer<
  typeof customerStatusChangeSchema
>;

export interface CustomerStatusActionState {
  success?: boolean;
  customerId?: string;
  previousStatus?: AccountStatus;
  newStatus?: AccountStatus;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export const customerReinstatementSchema = z.object({
  customerId: z.string().refine(isValidUuid, {
    message: "Invalid customer ID format.",
  }),
  reason: z
    .string()
    .trim()
    .min(5, "Reason must be at least 5 characters.")
    .max(255, "Reason cannot exceed 255 characters."),
});

export type CustomerReinstatementInput = z.infer<
  typeof customerReinstatementSchema
>;

export interface CustomerReinstatementActionState {
  success?: boolean;
  customerId?: string;
  previousStatus?: AccountStatus;
  newStatus?: AccountStatus;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}
