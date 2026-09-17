import { z } from "zod";
import { findRegion, findLocality } from "@/lib/address-data";

export const checkoutItemSchema = z.object({
  variantId: z.string().uuid("Invalid cart item"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(99, "Quantity cannot exceed 99"),
});

export const checkoutShippingAddressSchema = z
  .object({
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
    city: z.string().trim().max(70).optional(),
    state: z.string().trim().max(70).optional(),
    postalCode: z
      .string()
      .trim()
      .min(3, "Please enter your postal code")
      .max(12, "Postal code cannot exceed 12 characters"),
    country: z.string().trim().min(2, "Please select your country"),
    countryCode: z.enum(["VN", "US"]).optional(),
    provinceCode: z.string().trim().optional(),
    wardCode: z.string().trim().optional(),
    administrativeType: z.string().trim().optional(),
    provinceName: z.string().trim().optional(),
    wardName: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const isVN =
      data.countryCode === "VN" ||
      data.country === "Vietnam" ||
      data.country === "Việt Nam";
    const isUS =
      data.countryCode === "US" ||
      data.country === "United States" ||
      data.country === "Hoa Kỳ";

    if (isVN) {
      if (!data.provinceCode && !data.state) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["provinceCode"],
          message: "Please select a Province / Municipality",
        });
      } else if (data.provinceCode) {
        const region = findRegion("VN", data.provinceCode);
        if (!region) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["provinceCode"],
            message: "Invalid Province / Municipality selection",
          });
        }
      }

      if (!data.wardCode && !data.city) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["wardCode"],
          message: "Please select a Ward / Commune / Special Zone",
        });
      } else if (data.wardCode && data.provinceCode) {
        const locality = findLocality("VN", data.provinceCode, data.wardCode);
        if (!locality) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["wardCode"],
            message: "Selected ward/commune does not belong to the chosen province",
          });
        }
      }
    } else if (isUS) {
      if (!data.provinceCode && !data.state) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["state"],
          message: "Please select a State",
        });
      } else {
        const stateVal = data.provinceCode || data.state || "";
        const region = findRegion("US", stateVal);
        if (!region) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["state"],
            message: "Invalid US State selection",
          });
        }
      }

      if (!data.city || data.city.trim().length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["city"],
          message: "Please enter your city",
        });
      }

      if (data.postalCode && !/^\d{5}(-\d{4})?$/.test(data.postalCode.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["postalCode"],
          message: "Please enter a valid 5-digit US ZIP code",
        });
      }
    }
  });

export const checkoutSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
  shippingAddress: checkoutShippingAddressSchema,
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
