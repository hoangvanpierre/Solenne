#!/usr/bin/env node
// ===========================================================================
// Solenne — Verification Harness for Product Management (Phase 1 & Phase 2)
// ===========================================================================
import fs from "node:fs";

let passed = 0;
let failed = 0;

function assert(description, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${description}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${description} ${detail ? `-> ${detail}` : ""}`);
  }
}

console.log("== 1. File Structure & Exports ==");
const valPath = new URL("../lib/validations/product.ts", import.meta.url);
const valPluralPath = new URL("../lib/validations/products.ts", import.meta.url);
const adminDataPath = new URL("../lib/admin-products.ts", import.meta.url);
const actionPath = new URL("../app/actions/products.ts", import.meta.url);
const actionPluralPath = new URL("../app/actions/product.ts", import.meta.url);

assert("lib/validations/product.ts exists", fs.existsSync(valPath));
assert("lib/validations/products.ts exists", fs.existsSync(valPluralPath));
assert("lib/admin-products.ts exists", fs.existsSync(adminDataPath));
assert("app/actions/products.ts exists", fs.existsSync(actionPath));
assert("app/actions/product.ts exists", fs.existsSync(actionPluralPath));

const valCode = fs.readFileSync(valPath, "utf8");
const adminDataCode = fs.readFileSync(adminDataPath, "utf8");
const actionCode = fs.readFileSync(actionPath, "utf8");

assert("exports createProductSchema", valCode.includes("export const createProductSchema"));
assert("exports updateProductSchema", valCode.includes("export const updateProductSchema"));
assert("exports createVariantSchema", valCode.includes("export const createVariantSchema"));
assert("exports updateVariantSchema", valCode.includes("export const updateVariantSchema"));
assert("exports scentCategorySchema", valCode.includes("export const scentCategorySchema"));
assert("exports ProductActionState", valCode.includes("export interface ProductActionState"));
assert("exports VariantActionState", valCode.includes("export interface VariantActionState"));

assert("exports getAdminProducts", adminDataCode.includes("export async function getAdminProducts"));
assert("exports getAdminProductById", adminDataCode.includes("export async function getAdminProductById"));

assert("exports createProductAction", actionCode.includes("export async function createProductAction"));
assert("exports updateProductAction", actionCode.includes("export async function updateProductAction"));
assert("exports createVariantAction", actionCode.includes("export async function createVariantAction"));
assert("exports updateVariantAction", actionCode.includes("export async function updateVariantAction"));
assert("exports deleteProductAction", actionCode.includes("export async function deleteProductAction"));
assert("exports deleteVariantAction", actionCode.includes("export async function deleteVariantAction"));

console.log("\n== 2. Authorization Boundary Enforcement ==");
// Read helpers: requireAnyPermission(["product.create", "product.update", "product.delete"])
assert(
  "getAdminProducts gates with requireAnyPermission(['product.create', 'product.update', 'product.delete'])",
  adminDataCode.includes('requireAnyPermission([') &&
    adminDataCode.includes('"product.create"') &&
    adminDataCode.includes('"product.update"') &&
    adminDataCode.includes('"product.delete"')
);

// Actions authorization
assert(
  "createProductAction enforces requirePermission('product.create')",
  actionCode.includes('requirePermission("product.create")')
);
assert(
  "updateProductAction enforces requirePermission('product.update')",
  actionCode.includes('requirePermission("product.update")')
);
assert(
  "createVariantAction enforces requirePermission('product.update')",
  actionCode.includes('requirePermission("product.update")')
);
assert(
  "updateVariantAction enforces requirePermission('product.update')",
  actionCode.includes('requirePermission("product.update")')
);
assert(
  "deleteProductAction enforces requirePermission('product.delete')",
  actionCode.includes('requirePermission("product.delete")')
);
assert(
  "deleteVariantAction enforces requirePermission('product.delete')",
  actionCode.includes('requirePermission("product.delete")')
);

// No role or email bypass
assert("no hardcoded role checks in actions", !actionCode.includes("requireRole("));
assert("no email authorization in actions", !actionCode.includes(".email ===") && !actionCode.includes("CONTACT_EMAIL"));
assert("no hardcoded role checks in admin data", !adminDataCode.includes("requireRole("));

console.log("\n== 3. Stock Boundary & Immutability Enforcement ==");
// Schema: updateVariantSchema MUST NOT accept stock_quantity / stockQuantity / initialStock
assert("updateVariantSchema rejects stock_quantity via z.never()", valCode.includes("stock_quantity: z") && valCode.includes(".never("));
assert("updateVariantSchema rejects stockQuantity via z.never()", valCode.includes("stockQuantity: z") && valCode.includes(".never("));
assert("updateVariantSchema rejects initialStock via z.never()", valCode.includes("initialStock: z") && valCode.includes(".never("));

// Actions: updateVariantAction must never update stock_quantity
const updateVariantPayloadMatch = actionCode.match(/const updatePayload: \{[\s\S]*?\} = \{\};/);
assert("updateVariantAction typed payload explicitly defines only non-stock fields",
  !!updateVariantPayloadMatch &&
  !updateVariantPayloadMatch[0].includes("stock_quantity") &&
  !updateVariantPayloadMatch[0].includes("stockQuantity")
);

assert(
  "updateVariantAction does not update stock_quantity in query",
  !actionCode.includes("stock_quantity: data") &&
  !actionCode.includes("stock_quantity: input")
);

// createVariantAction: creation-time stock only
assert(
  "createVariantAction sets initial stock_quantity during INSERT only",
  actionCode.includes("stock_quantity: initialStock")
);

console.log("\n== 4. Delete Safety & Order Dependencies ==");
assert(
  "deleteProductAction verifies order_items for product_id",
  actionCode.includes('.from("order_items")') && actionCode.includes('.eq("product_id", productId)')
);
assert(
  "deleteProductAction verifies order_items for all variant_ids",
  actionCode.includes('.in("variant_id", variantIds)')
);
assert(
  "deleteProductAction recommends product deactivation when orders exist",
  actionCode.includes("deactivate the product instead")
);
const deleteProductActionBody = actionCode.slice(actionCode.indexOf("export async function deleteProductAction"));
assert(
  "deleteProductAction deletes variants before deleting product",
  deleteProductActionBody.indexOf('.from("product_variants")\n      .delete()') <
    deleteProductActionBody.indexOf('.from("products")\n    .delete()')
);
assert(
  "deleteVariantAction verifies order_items for variant_id",
  actionCode.includes('.from("order_items")') && actionCode.includes('.eq("variant_id", variantId)')
);
assert(
  "deleteVariantAction recommends parent product deactivation when orders exist",
  actionCode.includes("deactivate the parent product instead")
);

console.log("\n== 5. Audit Logging Coverage ==");
assert("logs product.created", actionCode.includes('action: "product.created"'));
assert("logs product.updated", actionCode.includes('action: "product.updated"'));
assert("logs product.deleted", actionCode.includes('action: "product.deleted"'));
assert("logs product_variant.created", actionCode.includes('action: "product_variant.created"'));
assert("logs product_variant.updated", actionCode.includes('action: "product_variant.updated"'));
assert("logs product_variant.deleted", actionCode.includes('action: "product_variant.deleted"'));
assert("logs product.create_rolled_back on variant creation failure", actionCode.includes('action: "product.create_rolled_back"'));
assert("variant creation audit preserves variant_id, sku, initial_stock",
  actionCode.includes("variant_id:") &&
  actionCode.includes("sku:") &&
  actionCode.includes("initial_stock:")
);

console.log("\n== 6. Cache Revalidation ==");
assert("revalidates /admin/products", actionCode.includes('revalidatePath("/admin/products")'));
assert("revalidates /products", actionCode.includes('revalidatePath("/products")'));
assert("revalidates /", actionCode.includes('revalidatePath("/")'));

console.log("\n== Summary ==");
console.log(`  ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
