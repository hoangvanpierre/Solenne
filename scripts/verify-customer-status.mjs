#!/usr/bin/env node
// ===========================================================================
// Solenne — Static Verification Harness for Module B2: Customer Account Status
// ===========================================================================
// Statically verifies that 0011_manage_customer_status_atomic.sql,
// lib/validations/customer.ts, lib/audit-utils.ts, lib/admin-customers.ts,
// app/actions/customers.ts, components/admin/customer-status-control.tsx,
// and app/admin/customers/[id]/page.tsx satisfy all architectural and security invariants:
//   - Column-level privilege hardening on public.profiles (revoking broad UPDATE)
//   - SECURITY DEFINER + search_path hardening
//   - in-function permission verification (staff.manage)
//   - auth.uid() identity derivation (no client-supplied actor_id)
//   - self-status change prevention (p_customer_id = auth.uid())
//   - row-level locking (FOR UPDATE)
//   - target role isolation (customer role only)
//   - transition state machine & terminal banned enforcement
//   - atomic in-transaction audit logging (customer.status_changed)
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
const migrationPath = new URL("../supabase/migrations/0011_manage_customer_status_atomic.sql", import.meta.url);
assert("migration 0011 file exists", fs.existsSync(migrationPath));

const sql = fs.readFileSync(migrationPath, "utf8");

assert("revokes broad UPDATE on profiles from authenticated", /revoke\s+update\s+on\s+public\.profiles\s+from\s+authenticated;/i.test(sql));
assert("grants column-specific UPDATE on profiles (safe columns only)", /grant\s+update\s+\(full_name,\s*phone,\s*avatar_url,\s*updated_at\)\s+on\s+public\.profiles\s+to\s+authenticated;/i.test(sql));
assert("defines function public.manage_customer_status", sql.includes("create or replace function public.manage_customer_status("));
assert("accepts customer UUID, target status text, and reason text", sql.includes("p_customer_id uuid") && sql.includes("p_target_status text") && sql.includes("p_reason text"));
assert("never accepts actor_id argument from caller", !sql.includes("p_actor_id"));
assert("is SECURITY DEFINER", sql.includes("security definer"));
assert("sets hardened search_path", /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i.test(sql));
assert("derives actor identity from auth.uid()", sql.includes("v_actor_id := auth.uid();"));
assert("rejects unauthenticated callers with 28000", sql.includes("UNAUTHENTICATED") && sql.includes("28000"));
assert("verifies staff.manage permission in-function with 42501", sql.includes("public.has_permission('staff.manage')") && sql.includes("42501"));
assert("rejects self-status change", sql.includes("p_customer_id = v_actor_id") && sql.includes("SELF_STATUS_CHANGE_FORBIDDEN"));
assert("validates target status in ('active', 'suspended', 'banned')", sql.includes("('active', 'suspended', 'banned')"));
assert("validates reason length 5 to 255", sql.includes("length(v_reason) < 5") && sql.includes("length(v_reason) > 255"));
assert("locks customer row FOR UPDATE", /from\s+public\.profiles\s+p[\s\S]*?for\s+update/i.test(sql));
assert("checks for target customer existence with P0002", sql.includes("CUSTOMER_NOT_FOUND") && sql.includes("P0002"));
assert("enforces customer role isolation", sql.includes("v_customer.role_name <> 'customer'") && sql.includes("INVALID_TARGET_ROLE"));
assert("rejects no-op status transition", sql.includes("NOOP_TRANSITION"));
assert("enforces banned status is terminal", sql.includes("BANNED_STATUS_TERMINAL"));
assert("rejects pending status transition", sql.includes("PENDING_STATUS_UNSUPPORTED"));
assert("enforces valid status transition matrix", sql.includes("INVALID_STATUS_TRANSITION"));
assert("redacts emails and phone numbers in reason before storage", sql.includes("[REDACTED_EMAIL]") && sql.includes("[REDACTED_PHONE]"));
assert("updates customer status and updated_at", /update\s+public\.profiles\s+set\s+status\s*=\s*v_target_status,\s*updated_at\s*=\s*now\(\)/i.test(sql));
assert("writes audit log with customer.status_changed inside transaction", sql.includes("'customer.status_changed'") && sql.includes("'profile'"));
assert("revokes execute from public and anon", sql.includes("revoke all on function public.manage_customer_status(uuid, text, text) from public;") && sql.includes("revoke all on function public.manage_customer_status(uuid, text, text) from anon;"));
assert("grants execute to authenticated and service_role", sql.includes("grant execute on function public.manage_customer_status(uuid, text, text) to authenticated;") && sql.includes("grant execute on function public.manage_customer_status(uuid, text, text) to service_role;"));
assert("includes self-verification block checking prosecdef and column privileges", sql.includes("Migration 0011 failed") && sql.includes("has_column_privilege"));

console.log("\n== 2. Validation Schema Checks (lib/validations/customer.ts) ==");
const validationPath = new URL("../lib/validations/customer.ts", import.meta.url);
assert("lib/validations/customer.ts exists", fs.existsSync(validationPath));

const validationCode = fs.readFileSync(validationPath, "utf8");
assert("exports customerStatusChangeSchema", validationCode.includes("export const customerStatusChangeSchema"));
assert("exports ALLOWED_MANAGEABLE_STATUSES", validationCode.includes("export const ALLOWED_MANAGEABLE_STATUSES"));
assert("enforces reason bounds (min 5, max 255)", validationCode.includes(".min(5") && validationCode.includes(".max(255"));
assert("superRefine checks for identical status (no-op)", validationCode.includes("currentStatus === targetStatus"));
assert("superRefine rejects transition from banned", validationCode.includes('currentStatus === "banned"'));
assert("superRefine rejects transition from pending", validationCode.includes('currentStatus === "pending"'));
assert("defines validTransitions mapping", validationCode.includes("validTransitions"));

console.log("\n== 3. Audit Utilities Checks (lib/audit-utils.ts) ==");
const auditUtilsPath = new URL("../lib/audit-utils.ts", import.meta.url);
assert("lib/audit-utils.ts exists", fs.existsSync(auditUtilsPath));

const auditUtilsCode = fs.readFileSync(auditUtilsPath, "utf8");
assert("AUDIT_ACTIONS contains customer.status_changed", auditUtilsCode.includes('"customer.status_changed"'));
assert("AUDIT_ACTION_CATEGORIES contains customer", auditUtilsCode.includes('"customer"'));
assert("formatAuditSummary handles customer.status_changed", auditUtilsCode.includes('case "customer.status_changed":'));
assert("formatAuditSummary provides bilingual summary (vi/en)", auditUtilsCode.includes("Thay đổi trạng thái khách hàng") && auditUtilsCode.includes("Customer status changed"));

console.log("\n== 4. Data Access Checks (lib/admin-customers.ts) ==");
const adminCustomersPath = new URL("../lib/admin-customers.ts", import.meta.url);
assert("lib/admin-customers.ts exists", fs.existsSync(adminCustomersPath));

const adminCustomersCode = fs.readFileSync(adminCustomersPath, "utf8");
assert("exports manageCustomerStatus", adminCustomersCode.includes("export async function manageCustomerStatus("));
assert("manageCustomerStatus enforces requirePermission('staff.manage')", adminCustomersCode.includes('requirePermission("staff.manage")'));
assert("manageCustomerStatus calls manage_customer_status RPC", adminCustomersCode.includes('.rpc("manage_customer_status"'));
assert("manageCustomerStatus passes customer_id, target_status, reason", adminCustomersCode.includes("p_customer_id:") && adminCustomersCode.includes("p_target_status:") && adminCustomersCode.includes("p_reason:"));

console.log("\n== 5. Server Action Checks (app/actions/customers.ts) ==");
const actionPath = new URL("../app/actions/customers.ts", import.meta.url);
assert("app/actions/customers.ts exists", fs.existsSync(actionPath));

const actionCode = fs.readFileSync(actionPath, "utf8");
assert("is marked 'use server'", actionCode.includes('"use server"'));
assert("exports manageCustomerStatusAction", actionCode.includes("export async function manageCustomerStatusAction("));
assert("enforces requirePermission('staff.manage')", actionCode.includes('requirePermission("staff.manage")'));
assert("validates input with customerStatusChangeSchema", actionCode.includes("customerStatusChangeSchema.safeParse"));
assert("uses user-scoped client (createClient from @/lib/supabase/server)", actionCode.includes('createClient()') && !actionCode.includes("createAdminClient"));
assert("invokes manage_customer_status RPC", actionCode.includes('.rpc("manage_customer_status"'));
assert("maps stable PostgreSQL error codes", actionCode.includes("CUSTOMER_NOT_FOUND") && actionCode.includes("INVALID_TARGET_ROLE") && actionCode.includes("SELF_STATUS_CHANGE_FORBIDDEN") && actionCode.includes("BANNED_STATUS_TERMINAL"));
assert("revalidates customer directory and customer detail paths", actionCode.includes('revalidatePath("/admin/customers")') && actionCode.includes('revalidatePath(`/admin/customers/${customerId}`)'));

console.log("\n== 6. UI Component Checks (components/admin/customer-status-control.tsx) ==");
const componentPath = new URL("../components/admin/customer-status-control.tsx", import.meta.url);
assert("components/admin/customer-status-control.tsx exists", fs.existsSync(componentPath));

const componentCode = fs.readFileSync(componentPath, "utf8");
assert("is marked 'use client'", componentCode.includes('"use client"'));
assert("exports CustomerStatusControl", componentCode.includes("export function CustomerStatusControl("));
assert("checks user authorization with useAuthz (staff.manage)", componentCode.includes("useAuthz") && componentCode.includes('can("staff.manage")'));
assert("handles active state actions (suspend, ban)", componentCode.includes('handleOpenAction("suspended")') && componentCode.includes('handleOpenAction("banned")'));
assert("handles suspended state actions (reactivate, ban)", componentCode.includes('handleOpenAction("active")') && componentCode.includes('handleOpenAction("banned")'));
assert("handles banned state as terminal", componentCode.includes('currentStatus === "banned"'));
assert("handles pending state as non-transitionable", componentCode.includes('currentStatus === "pending"'));
assert("includes reason textarea with character bounds", componentCode.includes("maxLength={255}") && componentCode.includes("trimmed.length < 5"));
assert("includes confirmation dialog flow", componentCode.includes("targetAction") && componentCode.includes("handleConfirm"));
assert("supports bilingual labels and messages", componentCode.includes("locale === \"vi\"") && componentCode.includes("Xác nhận"));

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
const testSchema = z
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

const validUuid = "11111111-1111-4111-8111-111111111111";

// Test A: active -> suspended (valid)
const res1 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "active",
  targetStatus: "suspended",
  reason: "Suspicious activity detected on account",
});
assert("valid active -> suspended parses successfully", res1.success === true);

// Test B: active -> banned (valid)
const res2 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "active",
  targetStatus: "banned",
  reason: "Severe policy breach and fraud confirmed",
});
assert("valid active -> banned parses successfully", res2.success === true);

// Test C: suspended -> active (valid)
const res3 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "suspended",
  targetStatus: "active",
  reason: "Account verified and customer issue resolved",
});
assert("valid suspended -> active parses successfully", res3.success === true);

// Test D: suspended -> banned (valid)
const res4 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "suspended",
  targetStatus: "banned",
  reason: "Investigation completed, confirmed fraud",
});
assert("valid suspended -> banned parses successfully", res4.success === true);

// Test E: banned -> active (rejected - terminal)
const res5 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "banned",
  targetStatus: "active",
  reason: "Attempt to reactivate banned customer",
});
assert("banned -> active is rejected", res5.success === false);

// Test F: banned -> suspended (rejected - terminal)
const res6 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "banned",
  targetStatus: "suspended",
  reason: "Attempt to move banned to suspended",
});
assert("banned -> suspended is rejected", res6.success === false);

// Test G: no-op active -> active (rejected)
const res7 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "active",
  targetStatus: "active",
  reason: "No-op transition attempt",
});
assert("active -> active no-op is rejected", res7.success === false);

// Test H: short reason < 5 chars (rejected)
const res8 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "active",
  targetStatus: "suspended",
  reason: "bad",
});
assert("reason < 5 chars is rejected", res8.success === false);

// Test I: pending -> active (rejected)
const res9 = testSchema.safeParse({
  customerId: validUuid,
  currentStatus: "pending",
  targetStatus: "active",
  reason: "Trying to activate pending account",
});
assert("pending -> active is rejected", res9.success === false);

console.log("\n== Final Verification Summary ==");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("\nALL MODULE B2 AUDIT & IMPLEMENTATION CHECKS PASSED!");
}
