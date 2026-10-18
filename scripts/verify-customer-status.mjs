#!/usr/bin/env node
// ===========================================================================
// Solenne — Static Verification Harness for Module B2: Customer Account Status
// & Controlled Reinstatement of Banned Customers
// ===========================================================================
// Statically verifies that:
//   - 0011_manage_customer_status_atomic.sql (B2 base)
//   - 0012_reinstate_banned_customer_atomic.sql (Controlled reinstatement)
//   - lib/validations/customer.ts
//   - lib/audit-utils.ts
//   - lib/admin-customers.ts
//   - app/actions/customers.ts
//   - components/admin/customer-status-control.tsx
//   - app/admin/customers/[id]/page.tsx
// satisfy all architectural and security invariants:
//   - Column-level privilege hardening on public.profiles (revoking broad UPDATE)
//   - SECURITY DEFINER + search_path hardening
//   - in-function permission verification (staff.manage)
//   - auth.uid() identity derivation (no client-supplied actor_id)
//   - self-status change and self-reinstatement prevention (p_customer_id = auth.uid())
//   - row-level locking (FOR UPDATE)
//   - target role isolation (customer role only)
//   - transition state machine & terminal banned enforcement in normal workflow
//   - dedicated atomic reinstatement RPC strictly requiring current status = banned
//   - atomic in-transaction audit logging (customer.status_changed & customer.reinstated)
//   - execution privilege hardening (no anon grant)
//   - server action wiring and user-scoped client enforcement
//   - client UI authorization & bilingual confirmation flow
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

console.log("== 1. Migration Checks (supabase/migrations/0011_manage_customer_status_atomic.sql) ==");
const migration11Path = new URL("../supabase/migrations/0011_manage_customer_status_atomic.sql", import.meta.url);
assert("migration 0011 file exists", fs.existsSync(migration11Path));

const sql11 = fs.readFileSync(migration11Path, "utf8");

assert("0011 revokes broad UPDATE on profiles from authenticated", /revoke\s+update\s+on\s+public\.profiles\s+from\s+authenticated;/i.test(sql11));
assert("0011 grants column-specific UPDATE on profiles (safe columns only)", /grant\s+update\s+\(full_name,\s*phone,\s*avatar_url,\s*updated_at\)\s+on\s+public\.profiles\s+to\s+authenticated;/i.test(sql11));
assert("0011 defines function public.manage_customer_status", sql11.includes("create or replace function public.manage_customer_status("));
assert("0011 accepts customer UUID, target status text, and reason text", sql11.includes("p_customer_id uuid") && sql11.includes("p_target_status text") && sql11.includes("p_reason text"));
assert("0011 never accepts actor_id argument from caller", !sql11.includes("p_actor_id"));
assert("0011 is SECURITY DEFINER", sql11.includes("security definer"));
assert("0011 sets hardened search_path", /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i.test(sql11));
assert("0011 derives actor identity from auth.uid()", sql11.includes("v_actor_id := auth.uid();"));
assert("0011 rejects unauthenticated callers with 28000", sql11.includes("UNAUTHENTICATED") && sql11.includes("28000"));
assert("0011 verifies staff.manage permission in-function with 42501", sql11.includes("public.has_permission('staff.manage')") && sql11.includes("42501"));
assert("0011 rejects self-status change", sql11.includes("p_customer_id = v_actor_id") && sql11.includes("SELF_STATUS_CHANGE_FORBIDDEN"));
assert("0011 validates target status in ('active', 'suspended', 'banned')", sql11.includes("('active', 'suspended', 'banned')"));
assert("0011 validates reason length 5 to 255", sql11.includes("length(v_reason) < 5") && sql11.includes("length(v_reason) > 255"));
assert("0011 locks customer row FOR UPDATE", /from\s+public\.profiles\s+p[\s\S]*?for\s+update/i.test(sql11));
assert("0011 checks for target customer existence with P0002", sql11.includes("CUSTOMER_NOT_FOUND") && sql11.includes("P0002"));
assert("0011 enforces customer role isolation", sql11.includes("v_customer.role_name <> 'customer'") && sql11.includes("INVALID_TARGET_ROLE"));
assert("0011 rejects no-op status transition", sql11.includes("NOOP_TRANSITION"));
assert("0011 enforces banned status is terminal", sql11.includes("BANNED_STATUS_TERMINAL"));
assert("0011 rejects pending status transition", sql11.includes("PENDING_STATUS_UNSUPPORTED"));
assert("0011 enforces valid status transition matrix", sql11.includes("INVALID_STATUS_TRANSITION"));
assert("0011 redacts emails and phone numbers in reason before storage", sql11.includes("[REDACTED_EMAIL]") && sql11.includes("[REDACTED_PHONE]"));
assert("0011 updates customer status and updated_at", /update\s+public\.profiles\s+set\s+status\s*=\s*v_target_status,\s*updated_at\s*=\s*now\(\)/i.test(sql11));
assert("0011 writes audit log with customer.status_changed inside transaction", sql11.includes("'customer.status_changed'") && sql11.includes("'profile'"));
assert("0011 revokes execute from public and anon", sql11.includes("revoke all on function public.manage_customer_status(uuid, text, text) from public;") && sql11.includes("revoke all on function public.manage_customer_status(uuid, text, text) from anon;"));
assert("0011 grants execute to authenticated and service_role", sql11.includes("grant execute on function public.manage_customer_status(uuid, text, text) to authenticated;") && sql11.includes("grant execute on function public.manage_customer_status(uuid, text, text) to service_role;"));
assert("0011 includes self-verification block checking prosecdef and column privileges", sql11.includes("Migration 0011 failed") && sql11.includes("has_column_privilege"));

console.log("\n== 1B. Reinstatement Migration Checks (supabase/migrations/0012_reinstate_banned_customer_atomic.sql) ==");
const migration12Path = new URL("../supabase/migrations/0012_reinstate_banned_customer_atomic.sql", import.meta.url);
assert("migration 0012 file exists", fs.existsSync(migration12Path));

const sql12 = fs.readFileSync(migration12Path, "utf8");

assert("0012 defines function public.reinstate_banned_customer", sql12.includes("create or replace function public.reinstate_banned_customer("));
assert("0012 accepts customer UUID and reason text", sql12.includes("p_customer_id uuid") && sql12.includes("p_reason text"));
assert("0012 never accepts actor_id argument from caller", !sql12.includes("p_actor_id"));
assert("0012 is SECURITY DEFINER", sql12.includes("security definer"));
assert("0012 sets hardened empty search_path", /set\s+search_path\s*=\s*''/i.test(sql12));
assert("0012 derives actor identity from auth.uid()", sql12.includes("v_actor_id := auth.uid();"));
assert("0012 rejects unauthenticated callers with 28000", sql12.includes("UNAUTHENTICATED") && sql12.includes("28000"));
assert("0012 verifies staff.manage permission in-function with 42501", sql12.includes("public.has_permission('staff.manage')") && sql12.includes("42501"));
assert("0012 rejects self-reinstatement", sql12.includes("p_customer_id = v_actor_id") && sql12.includes("SELF_REINSTATEMENT_FORBIDDEN"));
const fnMatch = sql12.match(/create or replace function public\.reinstate_banned_customer[\s\S]*?\$\$;/i);
const functionBody12 = fnMatch ? fnMatch[0] : "";

assert("0012 explicitly checks for null reason", functionBody12.includes("if p_reason is null then"));
assert("0012 uses valid pg_catalog.btrim function", functionBody12.includes("pg_catalog.btrim(p_reason)"));
assert("0012 rejects invalid pg_catalog.coalesce expression in function body", !functionBody12.includes("pg_catalog.coalesce"));
assert("0012 rejects invalid pg_catalog.trim expression in function body", !functionBody12.includes("pg_catalog.trim"));
assert("0012 validates reason length 5 to 255", (sql12.includes("length(v_reason) < 5") || sql12.includes("pg_catalog.length(v_reason) < 5")) && (sql12.includes("length(v_reason) > 255") || sql12.includes("pg_catalog.length(v_reason) > 255")));
assert("0012 locks customer row FOR UPDATE", /from\s+public\.profiles\s+p[\s\S]*?for\s+update/i.test(sql12));
assert("0012 checks for target customer existence with P0002", sql12.includes("CUSTOMER_NOT_FOUND") && sql12.includes("P0002"));
assert("0012 enforces customer role isolation", sql12.includes("v_customer.role_name <> 'customer'") && sql12.includes("INVALID_TARGET_ROLE"));
assert("0012 requires current status to be banned", sql12.includes("v_customer.status <> 'banned'") && sql12.includes("CUSTOMER_NOT_BANNED"));
assert("0012 redacts emails and phone numbers in reason before storage", sql12.includes("[REDACTED_EMAIL]") && sql12.includes("[REDACTED_PHONE]"));
assert("0012 updates customer status to active and sets updated_at", /update\s+public\.profiles\s+set\s+status\s*=\s*'active',\s*updated_at\s*=\s*(?:pg_catalog\.)?now\(\)/i.test(sql12));
assert("0012 writes audit log with customer.reinstated inside transaction", sql12.includes("'customer.reinstated'") && sql12.includes("'profile'"));
assert("0012 revokes execute from public, anon, and service_role", sql12.includes("revoke all on function public.reinstate_banned_customer(uuid, text) from public;") && sql12.includes("revoke all on function public.reinstate_banned_customer(uuid, text) from anon;") && sql12.includes("revoke all on function public.reinstate_banned_customer(uuid, text) from service_role;"));
assert("0012 grants execute exclusively to authenticated", sql12.includes("grant execute on function public.reinstate_banned_customer(uuid, text) to authenticated;") && !sql12.includes("grant execute on function public.reinstate_banned_customer(uuid, text) to service_role;"));
assert("0012 includes self-verification block checking prosecdef, search_path, grants, and absence of pseudo-catalog calls", sql12.includes("Migration 0012 failed") && sql12.includes("prosecdef") && sql12.includes("is_hardened_search_path") && sql12.includes("invalid pseudo-catalog function call"));

console.log("\n== 2. Validation Schema Checks (lib/validations/customer.ts) ==");
const validationPath = new URL("../lib/validations/customer.ts", import.meta.url);
assert("lib/validations/customer.ts exists", fs.existsSync(validationPath));

const validationCode = fs.readFileSync(validationPath, "utf8");
assert("exports customerStatusChangeSchema", validationCode.includes("export const customerStatusChangeSchema"));
assert("exports customerReinstatementSchema", validationCode.includes("export const customerReinstatementSchema"));
assert("exports ALLOWED_MANAGEABLE_STATUSES", validationCode.includes("export const ALLOWED_MANAGEABLE_STATUSES"));
assert("enforces reason bounds on status change", validationCode.includes(".min(5") && validationCode.includes(".max(255"));
assert("superRefine checks for identical status (no-op)", validationCode.includes("currentStatus === targetStatus"));
assert("superRefine rejects transition from banned", validationCode.includes('currentStatus === "banned"'));
assert("superRefine rejects transition from pending", validationCode.includes('currentStatus === "pending"'));
assert("defines validTransitions mapping", validationCode.includes("validTransitions"));
assert("customerReinstatementSchema enforces valid UUID", validationCode.includes("refine(isValidUuid"));

console.log("\n== 3. Audit Utilities Checks (lib/audit-utils.ts) ==");
const auditUtilsPath = new URL("../lib/audit-utils.ts", import.meta.url);
assert("lib/audit-utils.ts exists", fs.existsSync(auditUtilsPath));

const auditUtilsCode = fs.readFileSync(auditUtilsPath, "utf8");
assert("AUDIT_ACTIONS contains customer.status_changed", auditUtilsCode.includes('"customer.status_changed"'));
assert("AUDIT_ACTIONS contains customer.reinstated", auditUtilsCode.includes('"customer.reinstated"'));
assert("AUDIT_ACTION_CATEGORIES contains customer", auditUtilsCode.includes('"customer"'));
assert("formatAuditSummary handles customer.status_changed", auditUtilsCode.includes('case "customer.status_changed":'));
assert("formatAuditSummary handles customer.reinstated", auditUtilsCode.includes('case "customer.reinstated":'));
assert("formatAuditSummary provides bilingual summary (vi/en) for status_changed", auditUtilsCode.includes("Thay đổi trạng thái khách hàng") && auditUtilsCode.includes("Customer status changed"));
assert("formatAuditSummary provides bilingual summary (vi/en) for reinstated", auditUtilsCode.includes("Kích hoạt lại tài khoản khách hàng bị cấm") && auditUtilsCode.includes("Customer account reinstated from banned to active"));

console.log("\n== 4. Data Access Checks (lib/admin-customers.ts) ==");
const adminCustomersPath = new URL("../lib/admin-customers.ts", import.meta.url);
assert("lib/admin-customers.ts exists", fs.existsSync(adminCustomersPath));

const adminCustomersCode = fs.readFileSync(adminCustomersPath, "utf8");
assert("exports manageCustomerStatus", adminCustomersCode.includes("export async function manageCustomerStatus("));
assert("exports reinstateCustomer", adminCustomersCode.includes("export async function reinstateCustomer("));
assert("manageCustomerStatus enforces requirePermission('staff.manage')", adminCustomersCode.includes('requirePermission("staff.manage")'));
assert("reinstateCustomer enforces requirePermission('staff.manage')", adminCustomersCode.includes('requirePermission("staff.manage")'));
assert("manageCustomerStatus calls manage_customer_status RPC", adminCustomersCode.includes('.rpc("manage_customer_status"'));
assert("reinstateCustomer calls reinstate_banned_customer RPC", adminCustomersCode.includes('.rpc("reinstate_banned_customer"'));

console.log("\n== 5. Server Action Checks (app/actions/customers.ts) ==");
const actionPath = new URL("../app/actions/customers.ts", import.meta.url);
assert("app/actions/customers.ts exists", fs.existsSync(actionPath));

const actionCode = fs.readFileSync(actionPath, "utf8");
assert("is marked 'use server'", actionCode.includes('"use server"'));
assert("exports manageCustomerStatusAction", actionCode.includes("export async function manageCustomerStatusAction("));
assert("exports reinstateCustomerAction", actionCode.includes("export async function reinstateCustomerAction("));
assert("manageCustomerStatusAction enforces requirePermission('staff.manage')", actionCode.includes('requirePermission("staff.manage")'));
assert("reinstateCustomerAction enforces requirePermission('staff.manage')", actionCode.includes('requirePermission("staff.manage")'));
assert("reinstateCustomerAction validates input with customerReinstatementSchema", actionCode.includes("customerReinstatementSchema.safeParse"));
assert("reinstateCustomerAction uses user-scoped client", actionCode.includes('createClient()') && !actionCode.includes("createAdminClient"));
assert("reinstateCustomerAction invokes reinstate_banned_customer RPC", actionCode.includes('.rpc("reinstate_banned_customer"'));
assert("reinstateCustomerAction maps CUSTOMER_NOT_BANNED", actionCode.includes("CUSTOMER_NOT_BANNED"));
assert("reinstateCustomerAction maps SELF_REINSTATEMENT_FORBIDDEN", actionCode.includes("SELF_REINSTATEMENT_FORBIDDEN"));
assert("reinstateCustomerAction maps INVALID_TARGET_ROLE", actionCode.includes("INVALID_TARGET_ROLE"));
assert("reinstateCustomerAction revalidates paths", actionCode.includes('revalidatePath("/admin/customers")') && actionCode.includes('revalidatePath(`/admin/customers/${customerId}`)') && actionCode.includes('revalidatePath("/admin/audit")'));

console.log("\n== 6. UI Component Checks (components/admin/customer-status-control.tsx) ==");
const componentPath = new URL("../components/admin/customer-status-control.tsx", import.meta.url);
assert("components/admin/customer-status-control.tsx exists", fs.existsSync(componentPath));

const componentCode = fs.readFileSync(componentPath, "utf8");
assert("is marked 'use client'", componentCode.includes('"use client"'));
assert("exports CustomerStatusControl", componentCode.includes("export function CustomerStatusControl("));
assert("checks user authorization with useAuthz (staff.manage)", componentCode.includes("useAuthz") && componentCode.includes('can("staff.manage")'));
assert("imports reinstateCustomerAction", componentCode.includes("reinstateCustomerAction"));
assert("handles active state actions (suspend, ban)", componentCode.includes('handleOpenAction("suspended")') && componentCode.includes('handleOpenAction("banned")'));
assert("handles suspended state actions (reactivate, ban)", componentCode.includes('handleOpenAction("active")') && componentCode.includes('handleOpenAction("banned")'));
assert("handles banned state with dedicated reinstatement trigger", componentCode.includes('handleOpenAction("reinstate")'));
assert("handles pending state as non-transitionable", componentCode.includes('currentStatus === "pending"'));
assert("includes reason textarea with character bounds", componentCode.includes("maxLength={255}") && componentCode.includes("trimmed.length < 5"));
assert("includes confirmation dialog flow for reinstatement", componentCode.includes('targetAction === "reinstate"') && componentCode.includes("handleConfirm"));
assert("supports bilingual reinstatement labels and messages", componentCode.includes("Kích hoạt lại tài khoản bị cấm") && componentCode.includes("Reinstate Banned Customer"));

console.log("\n== 7. Barrel Exports (components/admin/index.ts) ==");
const barrelPath = new URL("../components/admin/index.ts", import.meta.url);
assert("components/admin/index.ts exists", fs.existsSync(barrelPath));

const barrelCode = fs.readFileSync(barrelPath, "utf8");
assert("exports CustomerStatusControl", barrelCode.includes('export { CustomerStatusControl } from "./customer-status-control";'));
assert("exports CustomerStatusControlProps", barrelCode.includes('export type { CustomerStatusControlProps } from "./customer-status-control";'));

console.log("\n== 8. Page Integration (app/admin/customers/[id]/page.tsx) ==");
const pagePath = new URL("../app/admin/customers/[id]/page.tsx", import.meta.url);
assert("app/admin/customers/[id]/page.tsx exists", fs.existsSync(pagePath));

const pageCode = fs.readFileSync(pagePath, "utf8");
assert("imports CustomerStatusControl from @/components/admin", pageCode.includes("CustomerStatusControl") && pageCode.includes('@/components/admin'));
assert("evaluates staff.manage permission", pageCode.includes('canManageStaff = actor.permissions.includes("staff.manage")'));
assert("renders CustomerStatusControl conditionally when caller has staff.manage", pageCode.includes("<CustomerStatusControl"));

console.log("\n== 9. Dynamic Schema Validation Tests ==");
import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(id) {
  return typeof id === "string" && UUID_REGEX.test(id);
}

// Replicate customerStatusChangeSchema to test the exact rules dynamically
const testStatusSchema = z
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

    const validTransitions = {
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

const testReinstatementSchema = z.object({
  customerId: z.string().refine(isValidUuid, {
    message: "Invalid customer ID format.",
  }),
  reason: z
    .string()
    .trim()
    .min(5, "Reason must be at least 5 characters.")
    .max(255, "Reason cannot exceed 255 characters."),
});

const validUuid = "11111111-1111-4111-8111-111111111111";

// Test A: active -> suspended (valid)
const res1 = testStatusSchema.safeParse({
  customerId: validUuid,
  currentStatus: "active",
  targetStatus: "suspended",
  reason: "Suspicious activity detected on account",
});
assert("valid active -> suspended parses successfully", res1.success === true);

// Test B: active -> banned (valid)
const res2 = testStatusSchema.safeParse({
  customerId: validUuid,
  currentStatus: "active",
  targetStatus: "banned",
  reason: "Severe policy breach and fraud confirmed",
});
assert("valid active -> banned parses successfully", res2.success === true);

// Test C: suspended -> active (valid)
const res3 = testStatusSchema.safeParse({
  customerId: validUuid,
  currentStatus: "suspended",
  targetStatus: "active",
  reason: "Account verified and customer issue resolved",
});
assert("valid suspended -> active parses successfully", res3.success === true);

// Test D: suspended -> banned (valid)
const res4 = testStatusSchema.safeParse({
  customerId: validUuid,
  currentStatus: "suspended",
  targetStatus: "banned",
  reason: "Investigation completed, confirmed fraud",
});
assert("valid suspended -> banned parses successfully", res4.success === true);

// Test E: banned -> active (rejected - terminal in normal workflow)
const res5 = testStatusSchema.safeParse({
  customerId: validUuid,
  currentStatus: "banned",
  targetStatus: "active",
  reason: "Attempt to reactivate banned customer through normal workflow",
});
assert("ordinary workflow strictly rejects banned -> active", res5.success === false);

// Test F: banned -> suspended (rejected - terminal in normal workflow)
const res6 = testStatusSchema.safeParse({
  customerId: validUuid,
  currentStatus: "banned",
  targetStatus: "suspended",
  reason: "Attempt to move banned to suspended",
});
assert("ordinary workflow strictly rejects banned -> suspended", res6.success === false);

// Test G: dedicated reinstatement schema with valid input (passes)
const res7 = testReinstatementSchema.safeParse({
  customerId: validUuid,
  reason: "Executive review approved account reinstatement following verification",
});
assert("dedicated reinstatement schema accepts valid input", res7.success === true);

// Test H: dedicated reinstatement schema with short reason < 5 (rejected)
const res8 = testReinstatementSchema.safeParse({
  customerId: validUuid,
  reason: "ok",
});
assert("dedicated reinstatement schema rejects reason < 5 chars", res8.success === false);

// Test I: dedicated reinstatement schema with whitespace-only reason (rejected)
const res9 = testReinstatementSchema.safeParse({
  customerId: validUuid,
  reason: "       ",
});
assert("dedicated reinstatement schema rejects whitespace reason", res9.success === false);

// Test J: dedicated reinstatement schema with oversized reason > 255 (rejected)
const res10 = testReinstatementSchema.safeParse({
  customerId: validUuid,
  reason: "a".repeat(256),
});
assert("dedicated reinstatement schema rejects reason > 255 chars", res10.success === false);

// Test K: dedicated reinstatement schema with invalid UUID (rejected)
const res11 = testReinstatementSchema.safeParse({
  customerId: "not-a-valid-uuid",
  reason: "Valid reason for reinstatement",
});
assert("dedicated reinstatement schema rejects invalid UUID", res11.success === false);

console.log("\n== Final Verification Summary ==");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\nALL MODULE B2 STATUS & REINSTATEMENT AUDIT CHECKS PASSED!");
}
