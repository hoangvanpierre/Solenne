"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authErrorState, requirePermission } from "@/lib/authz";
import { writeAuditLog } from "@/lib/audit";
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  type CreateProductInput,
  type UpdateProductInput,
  type CreateVariantInput,
  type UpdateVariantInput,
  type ProductActionState,
  type VariantActionState,
} from "@/lib/validations/product";

export type { ProductActionState, VariantActionState };

const uuidSchema = z.string().uuid();

function formatFieldErrors(error: z.ZodError): Record<string, string[]> {
  const flat: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (!flat[path]) {
      flat[path] = [];
    }
    flat[path].push(issue.message);
  }
  return flat;
}

/**
 * Create a new product and optional initial variants.
 * Strictly gated by product.create.
 */
export async function createProductAction(
  input: CreateProductInput
): Promise<ProductActionState> {
  // 1. Authorization: Require product.create
  let userId: string;
  try {
    ({ userId } = await requirePermission("product.create"));
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to create products."
    );
  }

  // 2. Validate input
  const validated = createProductSchema.safeParse(input);
  if (!validated.success) {
    return {
      error: validated.error.issues[0]?.message || "Invalid product input.",
      fieldErrors: formatFieldErrors(validated.error),
    };
  }

  const data = validated.data;
  const admin = createAdminClient();

  // 3. Insert product
  const basePrice = data.basePrice ?? data.base_price;
  const compareAtPrice = data.compareAtPrice ?? data.compare_at_price ?? null;
  const isActive = data.isActive ?? data.is_active ?? true;
  const isFeatured = data.isFeatured ?? data.is_featured ?? false;
  const scentTop = data.scentTop ?? data.scent_top ?? [];
  const scentHeart = data.scentHeart ?? data.scent_heart ?? [];
  const scentBase = data.scentBase ?? data.scent_base ?? [];

  const { data: insertedProduct, error: insertError } = await admin
    .from("products")
    .insert({
      slug: data.slug,
      name: data.name,
      tagline: data.tagline ?? null,
      description: data.description ?? null,
      category: data.category,
      base_price: basePrice,
      compare_at_price: compareAtPrice,
      is_active: isActive,
      is_featured: isFeatured,
      scent_top: scentTop,
      scent_heart: scentHeart,
      scent_base: scentBase,
      images: data.images ?? [],
    })
    .select("id, slug, name, category, base_price")
    .single();

  if (insertError) {
    if (insertError.code === "23505" || insertError.message.includes("slug")) {
      return {
        error:
          "A product with this slug already exists. Please choose a different slug.",
        fieldErrors: { slug: ["This slug is already in use."] },
      };
    }
    return { error: `Failed to create product: ${insertError.message}` };
  }

  const productId = insertedProduct.id;
  const createdVariants: {
    id: string;
    name: string;
    sku: string | null;
    initialStock: number;
    price: number;
  }[] = [];

  // 4. If variants were supplied, insert them establishing initial stock
  if (data.variants && data.variants.length > 0) {
    const variantRows = data.variants.map((v) => ({
      product_id: productId,
      name: v.name,
      size: v.size ?? null,
      burn_time: v.burnTime ?? v.burn_time ?? null,
      price: v.price,
      stock_quantity: v.initialStock ?? v.initial_stock ?? 0,
      sku: v.sku ?? null,
    }));

    const { data: insertedVariants, error: variantError } = await admin
      .from("product_variants")
      .insert(variantRows)
      .select("id, name, sku, stock_quantity, price");

    if (variantError) {
      // Partial-failure safety: rollback product to avoid orphaned record
      await admin.from("products").delete().eq("id", productId);
      await writeAuditLog({
        actorId: userId,
        action: "product.create_rolled_back",
        resourceType: "product",
        resourceId: productId,
        metadata: {
          slug: data.slug,
          reason: variantError.message,
        },
      });

      if (
        variantError.code === "23505" ||
        variantError.message.includes("sku")
      ) {
        return {
          error:
            "Failed to create variants due to a unique constraint violation (e.g. duplicate SKU).",
          fieldErrors: {
            "variants.sku": ["A variant with this SKU already exists."],
          },
        };
      }
      return {
        error: `Failed to create product variants: ${variantError.message}`,
      };
    }

    if (insertedVariants) {
      for (const row of insertedVariants) {
        createdVariants.push({
          id: row.id,
          name: row.name,
          sku: row.sku,
          initialStock: row.stock_quantity,
          price: Number(row.price),
        });
      }
    }
  }

  // 5. Audit logging: product.created
  await writeAuditLog({
    actorId: userId,
    action: "product.created",
    resourceType: "product",
    resourceId: productId,
    metadata: {
      name: insertedProduct.name,
      slug: insertedProduct.slug,
      category: insertedProduct.category,
      basePrice: Number(insertedProduct.base_price),
      variantCount: createdVariants.length,
    },
  });

  // Audit logging: product_variant.created for each variant
  for (const variant of createdVariants) {
    await writeAuditLog({
      actorId: userId,
      action: "product_variant.created",
      resourceType: "product_variant",
      resourceId: variant.id,
      metadata: {
        productId,
        variant_id: variant.id,
        variantId: variant.id,
        name: variant.name,
        sku: variant.sku,
        initial_stock: variant.initialStock,
        initialStock: variant.initialStock,
        price: variant.price,
      },
    });
  }

  // 6. Cache revalidation
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");

  return {
    success: true,
    productId,
    slug: insertedProduct.slug,
  };
}

/**
 * Update an existing product.
 * Strictly gated by product.update.
 * MUST NOT update any stock field.
 */
export async function updateProductAction(
  idOrInput: string | UpdateProductInput,
  maybeInput?: UpdateProductInput
): Promise<ProductActionState> {
  // 1. Authorization: Require product.update
  let userId: string;
  try {
    ({ userId } = await requirePermission("product.update"));
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to update products."
    );
  }

  const productId = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const input = typeof idOrInput === "string" ? (maybeInput ?? {}) : idOrInput;

  if (!productId || typeof productId !== "string") {
    return { error: "Product identifier is required." };
  }

  const idCheck = uuidSchema.safeParse(productId);
  if (!idCheck.success) {
    return { error: "Invalid product identifier." };
  }

  // 2. Validate input
  const validated = updateProductSchema.safeParse(input);
  if (!validated.success) {
    return {
      error: validated.error.issues[0]?.message || "Invalid update input.",
      fieldErrors: formatFieldErrors(validated.error),
    };
  }

  const data = validated.data;
  const admin = createAdminClient();

  // 3. Verify product exists
  const { data: existing, error: fetchError } = await admin
    .from("products")
    .select("id, slug, name")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError) {
    return { error: `Failed to verify product: ${fetchError.message}` };
  }
  if (!existing) {
    return { error: "Product not found." };
  }

  // 4. Update ONLY actual product metadata fields (NEVER stock)
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.slug !== undefined) updatePayload.slug = data.slug;
  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.tagline !== undefined) updatePayload.tagline = data.tagline;
  if (data.description !== undefined) updatePayload.description = data.description;
  if (data.category !== undefined) updatePayload.category = data.category;
  if (data.basePrice !== undefined || data.base_price !== undefined) {
    updatePayload.base_price = data.basePrice ?? data.base_price;
  }
  if (data.compareAtPrice !== undefined || data.compare_at_price !== undefined) {
    updatePayload.compare_at_price =
      data.compareAtPrice ?? data.compare_at_price;
  }
  if (data.isActive !== undefined || data.is_active !== undefined) {
    updatePayload.is_active = data.isActive ?? data.is_active;
  }
  if (data.isFeatured !== undefined || data.is_featured !== undefined) {
    updatePayload.is_featured = data.isFeatured ?? data.is_featured;
  }
  if (data.scentTop !== undefined || data.scent_top !== undefined) {
    updatePayload.scent_top = data.scentTop ?? data.scent_top;
  }
  if (data.scentHeart !== undefined || data.scent_heart !== undefined) {
    updatePayload.scent_heart = data.scentHeart ?? data.scent_heart;
  }
  if (data.scentBase !== undefined || data.scent_base !== undefined) {
    updatePayload.scent_base = data.scentBase ?? data.scent_base;
  }
  if (data.images !== undefined) updatePayload.images = data.images;

  const { data: updated, error: updateError } = await admin
    .from("products")
    .update(updatePayload)
    .eq("id", productId)
    .select("id, slug, name")
    .single();

  if (updateError) {
    if (updateError.code === "23505" || updateError.message.includes("slug")) {
      return {
        error:
          "A product with this slug already exists. Please choose a different slug.",
        fieldErrors: { slug: ["This slug is already in use."] },
      };
    }
    return { error: `Failed to update product: ${updateError.message}` };
  }

  // 5. Audit log
  await writeAuditLog({
    actorId: userId,
    action: "product.updated",
    resourceType: "product",
    resourceId: productId,
    metadata: {
      name: updated.name,
      previousSlug: existing.slug,
      newSlug: updated.slug,
      changedFields: Object.keys(updatePayload).filter(
        (k) => k !== "updated_at"
      ),
    },
  });

  // 6. Revalidate affected paths
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath(`/products/${existing.slug}`);
  if (updated.slug !== existing.slug) {
    revalidatePath(`/products/${updated.slug}`);
  }
  revalidatePath("/");

  return {
    success: true,
    productId,
    slug: updated.slug,
  };
}

/**
 * Create a new variant for an existing product.
 * Strictly gated by product.update.
 * Allows creation-time initialStock establishment only.
 */
export async function createVariantAction(
  productIdOrInput: string | CreateVariantInput,
  maybeInput?: CreateVariantInput
): Promise<VariantActionState> {
  // 1. Authorization: Require product.update
  let userId: string;
  try {
    ({ userId } = await requirePermission("product.update"));
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to add product variants."
    );
  }

  const productId =
    typeof productIdOrInput === "string"
      ? productIdOrInput
      : productIdOrInput.productId;
  const input =
    typeof productIdOrInput === "string" ? (maybeInput ?? {}) : productIdOrInput;

  if (!productId || typeof productId !== "string") {
    return { error: "Product identifier is required." };
  }

  const idCheck = uuidSchema.safeParse(productId);
  if (!idCheck.success) {
    return { error: "Invalid product identifier." };
  }

  // 2. Validate input
  const validated = createVariantSchema.safeParse(input);
  if (!validated.success) {
    return {
      error: validated.error.issues[0]?.message || "Invalid variant input.",
      fieldErrors: formatFieldErrors(validated.error),
    };
  }

  const data = validated.data;
  const admin = createAdminClient();

  // 3. Verify target product exists
  const { data: product, error: productError } = await admin
    .from("products")
    .select("id, slug, name")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    return { error: `Failed to verify product: ${productError.message}` };
  }
  if (!product) {
    return { error: "Target product not found." };
  }

  // 4. Insert new variant with creation-time initial stock
  const initialStock = data.initialStock ?? data.initial_stock ?? 0;

  const { data: newVariant, error: insertError } = await admin
    .from("product_variants")
    .insert({
      product_id: productId,
      name: data.name,
      size: data.size ?? null,
      burn_time: data.burnTime ?? data.burn_time ?? null,
      price: data.price,
      stock_quantity: initialStock,
      sku: data.sku ?? null,
    })
    .select("id, product_id, name, sku, stock_quantity, price")
    .single();

  if (insertError) {
    if (insertError.code === "23505" || insertError.message.includes("sku")) {
      return {
        error: "A variant with this SKU already exists.",
        fieldErrors: { sku: ["This SKU is already in use."] },
      };
    }
    return { error: `Failed to create variant: ${insertError.message}` };
  }

  // 5. Audit log (preserving variant_id, sku, initial_stock)
  await writeAuditLog({
    actorId: userId,
    action: "product_variant.created",
    resourceType: "product_variant",
    resourceId: newVariant.id,
    metadata: {
      productId,
      variant_id: newVariant.id,
      variantId: newVariant.id,
      name: newVariant.name,
      sku: newVariant.sku ?? null,
      initial_stock: initialStock,
      initialStock,
      price: Number(newVariant.price),
    },
  });

  // 6. Revalidate affected paths
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath(`/products/${product.slug}`);
  revalidatePath("/");

  return {
    success: true,
    variantId: newVariant.id,
    productId,
    sku: newVariant.sku,
  };
}

/**
 * Update an existing variant's metadata.
 * Strictly gated by product.update.
 * MANDATORY INVARIANT: NEVER updates stock_quantity.
 */
export async function updateVariantAction(
  variantIdOrInput: string | UpdateVariantInput,
  maybeInput?: UpdateVariantInput
): Promise<VariantActionState> {
  // 1. Authorization: Require product.update
  let userId: string;
  try {
    ({ userId } = await requirePermission("product.update"));
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to update product variants."
    );
  }

  const variantId =
    typeof variantIdOrInput === "string"
      ? variantIdOrInput
      : variantIdOrInput.id;
  const input =
    typeof variantIdOrInput === "string"
      ? (maybeInput ?? {})
      : variantIdOrInput;

  if (!variantId || typeof variantId !== "string") {
    return { error: "Variant identifier is required." };
  }

  const idCheck = uuidSchema.safeParse(variantId);
  if (!idCheck.success) {
    return { error: "Invalid variant identifier." };
  }

  // 2. Validate input
  const validated = updateVariantSchema.safeParse(input);
  if (!validated.success) {
    return {
      error:
        validated.error.issues[0]?.message || "Invalid variant update input.",
      fieldErrors: formatFieldErrors(validated.error),
    };
  }

  const data = validated.data;
  const admin = createAdminClient();

  // 3. Verify variant exists
  const { data: existingVariant, error: fetchError } = await admin
    .from("product_variants")
    .select("id, product_id, name, sku, products(id, slug)")
    .eq("id", variantId)
    .maybeSingle();

  if (fetchError) {
    return { error: `Failed to verify variant: ${fetchError.message}` };
  }
  if (!existingVariant) {
    return { error: "Product variant not found." };
  }

  // 4. Update ONLY editable variant metadata fields.
  // MANDATORY INVARIANT: stock_quantity is NEVER present in this payload.
  // Existing stock changes must continue exclusively through adjustInventoryAction.
  const updatePayload: {
    name?: string;
    size?: string | null;
    burn_time?: string | null;
    price?: number;
    sku?: string | null;
  } = {};

  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.size !== undefined) updatePayload.size = data.size;
  if (data.burnTime !== undefined || data.burn_time !== undefined) {
    updatePayload.burn_time = data.burnTime ?? data.burn_time;
  }
  if (data.price !== undefined) updatePayload.price = data.price;
  if (data.sku !== undefined) updatePayload.sku = data.sku;

  const { data: updatedVariant, error: updateError } = await admin
    .from("product_variants")
    .update(updatePayload)
    .eq("id", variantId)
    .select("id, product_id, name, sku, price")
    .single();

  if (updateError) {
    if (updateError.code === "23505" || updateError.message.includes("sku")) {
      return {
        error: "A variant with this SKU already exists.",
        fieldErrors: { sku: ["This SKU is already in use."] },
      };
    }
    return { error: `Failed to update variant: ${updateError.message}` };
  }

  // 5. Audit log
  await writeAuditLog({
    actorId: userId,
    action: "product_variant.updated",
    resourceType: "product_variant",
    resourceId: variantId,
    metadata: {
      productId: existingVariant.product_id,
      variantId,
      name: updatedVariant.name,
      changedFields: Object.keys(updatePayload),
    },
  });

  // 6. Revalidate
  revalidatePath("/admin/products");
  revalidatePath("/products");
  const productSlug = (
    existingVariant.products as unknown as { slug?: string } | null
  )?.slug;
  if (productSlug) {
    revalidatePath(`/products/${productSlug}`);
  }
  revalidatePath("/");

  return {
    success: true,
    variantId,
    productId: existingVariant.product_id,
    sku: updatedVariant.sku,
  };
}

/**
 * Delete a product and its variants.
 * Strictly gated by product.delete.
 * Rejects deletion if any order_items reference the product or its variants.
 */
export async function deleteProductAction(
  productIdOrInput: string | { id: string }
): Promise<ProductActionState> {
  // 1. Authorization: Require product.delete
  let userId: string;
  try {
    ({ userId } = await requirePermission("product.delete"));
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to delete products."
    );
  }

  const productId =
    typeof productIdOrInput === "string"
      ? productIdOrInput
      : productIdOrInput?.id;

  if (!productId || typeof productId !== "string") {
    return { error: "Product identifier is required." };
  }

  const idCheck = uuidSchema.safeParse(productId);
  if (!idCheck.success) {
    return { error: "Invalid product identifier." };
  }

  const admin = createAdminClient();

  // 2. Verify product exists
  const { data: product, error: fetchError } = await admin
    .from("products")
    .select("id, name, slug")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError) {
    return { error: `Failed to verify product: ${fetchError.message}` };
  }
  if (!product) {
    return { error: "Product not found." };
  }

  // 3. Fetch all variant IDs belonging to the product
  const { data: variants, error: variantFetchError } = await admin
    .from("product_variants")
    .select("id")
    .eq("product_id", productId);

  if (variantFetchError) {
    return {
      error: `Failed to check product variants: ${variantFetchError.message}`,
    };
  }

  const variantIds = (variants ?? []).map((v) => v.id);

  // 4. Check whether any order_items reference product_id OR any of its variant_ids
  const { count: productOrderCount, error: productOrderError } = await admin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId);

  if (productOrderError) {
    return {
      error: `Failed to check order history: ${productOrderError.message}`,
    };
  }

  if ((productOrderCount ?? 0) > 0) {
    return {
      error:
        "This product cannot be deleted because it is referenced in past customer orders. Please deactivate the product instead to remove it from the boutique.",
    };
  }

  if (variantIds.length > 0) {
    const { count: variantOrderCount, error: variantOrderError } = await admin
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .in("variant_id", variantIds);

    if (variantOrderError) {
      return {
        error: `Failed to check variant order history: ${variantOrderError.message}`,
      };
    }

    if ((variantOrderCount ?? 0) > 0) {
      return {
        error:
          "This product cannot be deleted because its variants are referenced in past customer orders. Please deactivate the product instead to remove it from the boutique.",
      };
    }
  }

  // 5. Delete variants in safe dependency order, then delete product
  if (variantIds.length > 0) {
    const { error: variantDeleteError } = await admin
      .from("product_variants")
      .delete()
      .eq("product_id", productId);

    if (variantDeleteError) {
      return {
        error: `Failed to delete product variants: ${variantDeleteError.message}`,
      };
    }
  }

  const { error: productDeleteError } = await admin
    .from("products")
    .delete()
    .eq("id", productId);

  if (productDeleteError) {
    return { error: `Failed to delete product: ${productDeleteError.message}` };
  }

  // 6. Audit log
  await writeAuditLog({
    actorId: userId,
    action: "product.deleted",
    resourceType: "product",
    resourceId: productId,
    metadata: {
      name: product.name,
      slug: product.slug,
      deletedVariantCount: variantIds.length,
    },
  });

  // 7. Revalidate
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath(`/products/${product.slug}`);
  revalidatePath("/");

  return {
    success: true,
    productId,
    slug: product.slug,
  };
}

/**
 * Delete a product variant.
 * Strictly gated by product.delete.
 * Rejects deletion if any order_items reference the variant.
 */
export async function deleteVariantAction(
  variantIdOrInput: string | { id: string }
): Promise<VariantActionState> {
  // 1. Authorization: Require product.delete
  let userId: string;
  try {
    ({ userId } = await requirePermission("product.delete"));
  } catch (error) {
    return authErrorState(
      error,
      "You do not have permission to delete product variants."
    );
  }

  const variantId =
    typeof variantIdOrInput === "string"
      ? variantIdOrInput
      : variantIdOrInput?.id;

  if (!variantId || typeof variantId !== "string") {
    return { error: "Variant identifier is required." };
  }

  const idCheck = uuidSchema.safeParse(variantId);
  if (!idCheck.success) {
    return { error: "Invalid variant identifier." };
  }

  const admin = createAdminClient();

  // 2. Verify variant exists
  const { data: variant, error: fetchError } = await admin
    .from("product_variants")
    .select("id, product_id, name, sku, products(id, name, slug)")
    .eq("id", variantId)
    .maybeSingle();

  if (fetchError) {
    return { error: `Failed to verify variant: ${fetchError.message}` };
  }
  if (!variant) {
    return { error: "Product variant not found." };
  }

  // 3. Check whether order_items references this variant
  const { count: orderCount, error: orderError } = await admin
    .from("order_items")
    .select("id", { count: "exact", head: true })
    .eq("variant_id", variantId);

  if (orderError) {
    return {
      error: `Failed to check order history: ${orderError.message}`,
    };
  }

  if ((orderCount ?? 0) > 0) {
    return {
      error:
        "This variant cannot be deleted because it is referenced in past customer orders. Please deactivate the parent product instead.",
    };
  }

  // 4. Hard-delete variant (stock is not altered, no cascade on orders)
  const { error: deleteError } = await admin
    .from("product_variants")
    .delete()
    .eq("id", variantId);

  if (deleteError) {
    return { error: `Failed to delete variant: ${deleteError.message}` };
  }

  // 5. Audit log
  await writeAuditLog({
    actorId: userId,
    action: "product_variant.deleted",
    resourceType: "product_variant",
    resourceId: variantId,
    metadata: {
      productId: variant.product_id,
      variantId,
      name: variant.name,
      sku: variant.sku ?? null,
    },
  });

  // 6. Revalidate
  revalidatePath("/admin/products");
  revalidatePath("/products");
  const productSlug = (
    variant.products as unknown as { slug?: string } | null
  )?.slug;
  if (productSlug) {
    revalidatePath(`/products/${productSlug}`);
  }
  revalidatePath("/");

  return {
    success: true,
    variantId,
    productId: variant.product_id,
    sku: variant.sku,
  };
}
