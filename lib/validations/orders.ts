import { z } from "zod";
import type { OrderStatus } from "@/types/order";

export const orderStatusSchema = z.enum([
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const);

export const transitionOrderStatusSchema = z
  .object({
    orderId: z.string().uuid("Invalid order identifier."),
    targetStatus: orderStatusSchema,
    trackingCode: z
      .string()
      .trim()
      .min(3, "Tracking code must be at least 3 characters.")
      .max(100, "Tracking code cannot exceed 100 characters.")
      .optional()
      .or(z.literal("")),
    reason: z
      .string()
      .trim()
      .min(3, "Reason must be at least 3 characters.")
      .max(500, "Reason cannot exceed 500 characters.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.targetStatus === "shipped") {
      const code = data.trackingCode?.trim();
      if (!code || code.length < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["trackingCode"],
          message: "Tracking code is required when shipping an order.",
        });
      }
    }
  });

export type TransitionOrderStatusInput = z.infer<
  typeof transitionOrderStatusSchema
>;

export interface TransitionOrderActionState {
  success?: boolean;
  orderNumber?: string;
  previousStatus?: OrderStatus;
  newStatus?: OrderStatus;
  trackingCode?: string | null;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}
