import { z } from "zod";

export const addressSchema = z.object({
  line1: z
    .string()
    .trim()
    .min(4, "Please enter your street address")
    .max(120, "Street address is too long"),
  line2: z.string().trim().max(120, "Address line is too long").optional(),
  city: z.string().trim().min(2, "Please enter your city").max(70),
  state: z.string().trim().max(70, "State / Province is too long").optional(),
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
});

export type AddressInput = z.infer<typeof addressSchema>;

export const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(70, "Full name cannot exceed 70 characters"),
  phone: z
    .string()
    .trim()
    .max(20, "Phone number cannot exceed 20 characters")
    .refine(
      (value) => value === "" || value.length >= 6,
      "Please enter a valid phone number"
    ),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export type AccountActionState = {
  success?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};
