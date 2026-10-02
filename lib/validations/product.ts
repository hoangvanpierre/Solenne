import { z } from "zod";

export const scentCategorySchema = z.enum([
  "floral",
  "woody",
  "fresh",
  "warm",
] as const);

export type ScentCategoryInput = z.infer<typeof scentCategorySchema>;

/**
 * Validation schema for creating a new product variant.
 * Allows setting creation-time initial stock, but existing stock
 * cannot be manipulated through product management.
 */
export const createVariantSchema = z
  .object({
    productId: z.string().uuid("Invalid product identifier.").optional(),
    name: z
      .string()
      .trim()
      .min(1, "Variant name is required.")
      .max(100, "Variant name cannot exceed 100 characters."),
    size: z
      .string()
      .trim()
      .max(50, "Size cannot exceed 50 characters.")
      .optional()
      .nullable(),
    burnTime: z
      .string()
      .trim()
      .max(50, "Burn time cannot exceed 50 characters.")
      .optional()
      .nullable(),
    burn_time: z
      .string()
      .trim()
      .max(50, "Burn time cannot exceed 50 characters.")
      .optional()
      .nullable(),
    price: z
      .number()
      .min(0, "Price must be non-negative."),
    sku: z
      .string()
      .trim()
      .max(100, "SKU cannot exceed 100 characters.")
      .optional()
      .nullable(),
    // Initial stock is integer >= 0, representing creation-time stock only
    initialStock: z
      .number()
      .int("Initial stock must be an integer.")
      .min(0, "Initial stock cannot be negative.")
      .default(0)
      .optional(),
    initial_stock: z
      .number()
      .int("Initial stock must be an integer.")
      .min(0, "Initial stock cannot be negative.")
      .optional(),
    // Explicitly reject ongoing stock mutations
    stock_quantity: z
      .never({
        message:
          "Stock quantity cannot be set directly. Use 'initialStock' to set creation-time stock for new variants.",
      })
      .optional(),
    stockQuantity: z
      .never({
        message:
          "Stock quantity cannot be set directly. Use 'initialStock' to set creation-time stock for new variants.",
      })
      .optional(),
  })
  .strict();

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

/**
 * Validation schema for updating an existing product variant.
 * MUST NOT accept stock_quantity / stockQuantity.
 * Existing stock changes must continue exclusively through Inventory.
 */
export const updateVariantSchema = z
  .object({
    id: z.string().uuid("Invalid variant identifier.").optional(),
    name: z
      .string()
      .trim()
      .min(1, "Variant name is required.")
      .max(100, "Variant name cannot exceed 100 characters.")
      .optional(),
    size: z
      .string()
      .trim()
      .max(50, "Size cannot exceed 50 characters.")
      .optional()
      .nullable(),
    burnTime: z
      .string()
      .trim()
      .max(50, "Burn time cannot exceed 50 characters.")
      .optional()
      .nullable(),
    burn_time: z
      .string()
      .trim()
      .max(50, "Burn time cannot exceed 50 characters.")
      .optional()
      .nullable(),
    price: z
      .number()
      .min(0, "Price must be non-negative.")
      .optional(),
    sku: z
      .string()
      .trim()
      .max(100, "SKU cannot exceed 100 characters.")
      .optional()
      .nullable(),
    // MUST NOT accept stock_quantity or stockQuantity
    stock_quantity: z
      .never({
        message:
          "Stock quantity cannot be updated via Product Management. Existing stock must be adjusted through inventory management.",
      })
      .optional(),
    stockQuantity: z
      .never({
        message:
          "Stock quantity cannot be updated via Product Management. Existing stock must be adjusted through inventory management.",
      })
      .optional(),
    initialStock: z
      .never({
        message:
          "Initial stock can only be provided when creating a new variant.",
      })
      .optional(),
    initial_stock: z
      .never({
        message:
          "Initial stock can only be provided when creating a new variant.",
      })
      .optional(),
  })
  .strict();

export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

/**
 * Validation schema for creating a new product.
 * Validates only actual fields present in the Solenne product model.
 */
export const createProductSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .min(1, "Slug is required.")
      .max(100, "Slug cannot exceed 100 characters.")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must be lowercase alphanumeric characters separated by single hyphens."
      ),
    name: z
      .string()
      .trim()
      .min(1, "Product name is required.")
      .max(150, "Product name cannot exceed 150 characters."),
    tagline: z
      .string()
      .trim()
      .max(255, "Tagline cannot exceed 255 characters.")
      .optional()
      .nullable(),
    description: z.string().trim().optional().nullable(),
    category: scentCategorySchema,
    basePrice: z
      .number()
      .min(0, "Base price must be non-negative."),
    base_price: z
      .number()
      .min(0, "Base price must be non-negative.")
      .optional(),
    compareAtPrice: z
      .number()
      .min(0, "Compare at price must be non-negative.")
      .optional()
      .nullable(),
    compare_at_price: z
      .number()
      .min(0, "Compare at price must be non-negative.")
      .optional()
      .nullable(),
    isActive: z.boolean().default(true).optional(),
    is_active: z.boolean().optional(),
    isFeatured: z.boolean().default(false).optional(),
    is_featured: z.boolean().optional(),
    scentTop: z.array(z.string().trim()).default([]).optional(),
    scent_top: z.array(z.string().trim()).optional(),
    scentHeart: z.array(z.string().trim()).default([]).optional(),
    scent_heart: z.array(z.string().trim()).optional(),
    scentBase: z.array(z.string().trim()).default([]).optional(),
    scent_base: z.array(z.string().trim()).optional(),
    images: z.array(z.string().trim()).default([]).optional(),
    variants: z.array(createVariantSchema).optional(),
    // Product create must not accept stock_quantity / stockQuantity
    stock_quantity: z
      .never({
        message:
          "Stock quantity cannot be set directly on products. Stock belongs to variants.",
      })
      .optional(),
    stockQuantity: z
      .never({
        message:
          "Stock quantity cannot be set directly on products. Stock belongs to variants.",
      })
      .optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Validation schema for updating an existing product.
 * Validates only actual fields present in the Solenne product model.
 * MUST NOT accept stock_quantity / stockQuantity.
 */
export const updateProductSchema = z
  .object({
    id: z.string().uuid("Invalid product identifier.").optional(),
    slug: z
      .string()
      .trim()
      .min(1, "Slug is required.")
      .max(100, "Slug cannot exceed 100 characters.")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must be lowercase alphanumeric characters separated by single hyphens."
      )
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, "Product name is required.")
      .max(150, "Product name cannot exceed 150 characters.")
      .optional(),
    tagline: z
      .string()
      .trim()
      .max(255, "Tagline cannot exceed 255 characters.")
      .optional()
      .nullable(),
    description: z.string().trim().optional().nullable(),
    category: scentCategorySchema.optional(),
    basePrice: z
      .number()
      .min(0, "Base price must be non-negative.")
      .optional(),
    base_price: z
      .number()
      .min(0, "Base price must be non-negative.")
      .optional(),
    compareAtPrice: z
      .number()
      .min(0, "Compare at price must be non-negative.")
      .optional()
      .nullable(),
    compare_at_price: z
      .number()
      .min(0, "Compare at price must be non-negative.")
      .optional()
      .nullable(),
    isActive: z.boolean().optional(),
    is_active: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    is_featured: z.boolean().optional(),
    scentTop: z.array(z.string().trim()).optional(),
    scent_top: z.array(z.string().trim()).optional(),
    scentHeart: z.array(z.string().trim()).optional(),
    scent_heart: z.array(z.string().trim()).optional(),
    scentBase: z.array(z.string().trim()).optional(),
    scent_base: z.array(z.string().trim()).optional(),
    images: z.array(z.string().trim()).optional(),
    // Product update must not accept stock_quantity / stockQuantity
    stock_quantity: z
      .never({
        message:
          "Stock quantity cannot be updated via Product Management. Use inventory adjustments.",
      })
      .optional(),
    stockQuantity: z
      .never({
        message:
          "Stock quantity cannot be updated via Product Management. Use inventory adjustments.",
      })
      .optional(),
  })
  .strict();

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export interface ProductActionState {
  success?: boolean;
  productId?: string;
  slug?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export interface VariantActionState {
  success?: boolean;
  variantId?: string;
  productId?: string;
  sku?: string | null;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

