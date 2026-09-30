import { z } from "zod";

export const adjustInventorySchema = z.object({
  variantId: z.string().uuid("Invalid variant identifier."),
  delta: z
    .number()
    .int("Delta must be an integer.")
    .refine((val) => val !== 0, "Adjustment delta cannot be zero."),
  reason: z
    .string()
    .trim()
    .min(3, "Reason must be at least 3 characters.")
    .max(255, "Reason cannot exceed 255 characters."),
});

export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;

export interface AdjustInventoryActionState {
  success?: boolean;
  variantId?: string;
  sku?: string;
  previousStock?: number;
  newStock?: number;
  delta?: number;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}
