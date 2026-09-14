import { z } from "zod";

export const checkoutItemSchema = z.object({
  variantId: z.string().uuid("Invalid cart item"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Quantity cannot exceed 99"),
});

export const checkoutSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  shippingAddress: z.object({
    fullName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(70, "Full name cannot exceed 70 characters"),
    phone: z
      .string()
      .trim()
      .min(6, "Please enter a valid phone number")
      .max(20, "Phone number cannot exceed 20 characters"),
    line1: z.string().trim().min(4, "Please enter your street address"),
    line2: z.string().trim().max(100).optional(),
    city: z.string().trim().min(2, "Please enter your city"),
    state: z.string().trim().max(70).optional(),
    postalCode: z
      .string()
      .trim()
      .min(3, "Please enter your postal code")
      .max(12, "Postal code cannot exceed 12 characters"),
    country: z
      .string()
      .trim()
      .min(2, "Please enter your country")
      .max(56, "Country name is too long"),
  }),
  items: z.array(checkoutItemSchema).min(1, "Your cart is empty"),
  notes: z.string().trim().max(500, "Notes cannot exceed 500 characters").optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;

export type CheckoutActionState = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  orderNumber?: string;
};
