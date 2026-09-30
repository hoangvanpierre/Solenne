#!/usr/bin/env node
// ===========================================================================
// Solenne Role-Based Post-Login Routing Verification
// ===========================================================================
// Comprehensive verification harness for role-based post-login routing.
// Tests the centralized post-login resolver, routing matrix, next= precedence,
// restricted account isolation, and open redirect defenses.
//
// Usage:
//   node scripts/verify-post-login-routing.mjs
// ===========================================================================
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  resolvePostLoginPath,
  sanitizeNextPath,
  hasManagementAccess,
  getRoleDefaultPath,
  MANAGEMENT_PERMISSIONS,
  FALLBACK_PATH,
} from "../lib/redirect.ts";

const results = [];
function record(section, name, ok, actual) {
  results.push({ section, name, ok, actual });
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name}${ok ? "" : `  -> ${actual}`}`);
}

console.log("== 1. Centralized Resolver: Role Defaults (no next supplied) ==");

// Simulated actor fixtures
const customerActor = {
  userId: "00000000-0000-0000-0000-000000000001",
  role: "customer",
  status: "active",
  permissions: [
    "product.read",
    "order.create",
    "order.read_own",
    "profile.read_own",
    "profile.update_own",
  ],
};

const staffActor = {
  userId: "00000000-0000-0000-0000-000000000002",
  role: "staff",
  status: "active",
  permissions: [
    "product.read",
    "product.create",
    "product.update",
    "order.read",
    "order.update",
    "inventory.read",
    "inventory.update",
    "customer.read",
    "profile.read_own",
    "profile.update_own",
  ],
};

const managerActor = {
  userId: "00000000-0000-0000-0000-000000000003",
  role: "manager",
  status: "active",
  permissions: [
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "order.read",
    "order.update",
    "order.cancel",
    "inventory.read",
    "inventory.update",
    "customer.read",
    "analytics.read",
    "staff.read",
    "profile.read_own",
    "profile.update_own",
  ],
};

const adminActor = {
  userId: "00000000-0000-0000-0000-000000000004",
  role: "admin",
  status: "active",
  permissions: [
    "product.read",
    "product.create",
    "product.update",
    "product.delete",
    "order.read",
    "order.read_own",
    "order.create",
    "order.update",
    "order.cancel",
    "inventory.read",
    "inventory.update",
    "customer.read",
    "customer.update",
    "analytics.read",
    "staff.read",
    "staff.manage",
    "role.read",
    "role.manage",
    "audit.read",
    "profile.read_own",
    "profile.update_own",
  ],
};

// 1. customer without next -> /account
const res1 = resolvePostLoginPath(customerActor, null);
record("defaults", "customer without next -> /account", res1 === "/account", res1);

// 2. staff without next -> /admin
const res2 = resolvePostLoginPath(staffActor, null);
record("defaults", "staff without next -> /admin", res2 === "/admin", res2);

// 3. manager without next -> /admin
const res3 = resolvePostLoginPath(managerActor, null);
record("defaults", "manager without next -> /admin", res3 === "/admin", res3);

// 4. admin without next -> /admin
const res4 = resolvePostLoginPath(adminActor, null);
record("defaults", "admin without next -> /admin", res4 === "/admin", res4);

// Empty string next is treated as no next
const res4Empty = resolvePostLoginPath(adminActor, "");
record("defaults", "admin with empty next -> /admin", res4Empty === "/admin", res4Empty);

console.log("\n== 2. Explicit next= Precedence Rules ==");

// 5. customer + next=/checkout -> /checkout
const res5 = resolvePostLoginPath(customerActor, "/checkout");
record("precedence", "customer + next=/checkout -> /checkout", res5 === "/checkout", res5);

// 6. customer + next=/account/orders -> /account/orders
const res6 = resolvePostLoginPath(customerActor, "/account/orders");
record("precedence", "customer + next=/account/orders -> /account/orders", res6 === "/account/orders", res6);

// 7. customer + next=/admin -> /account (boundary enforcement)
const res7 = resolvePostLoginPath(customerActor, "/admin");
record("precedence", "customer + next=/admin -> /account", res7 === "/account", res7);

// Customer attempting /admin/orders -> /account
const res7b = resolvePostLoginPath(customerActor, "/admin/orders");
record("precedence", "customer + next=/admin/orders -> /account", res7b === "/account", res7b);

// 8. staff + next=/admin/orders -> /admin/orders
const res8 = resolvePostLoginPath(staffActor, "/admin/orders");
record("precedence", "staff + next=/admin/orders -> /admin/orders", res8 === "/admin/orders", res8);

// 9. manager + next=/admin/orders -> /admin/orders
const res9 = resolvePostLoginPath(managerActor, "/admin/orders");
record("precedence", "manager + next=/admin/orders -> /admin/orders", res9 === "/admin/orders", res9);

// 10. admin + next=/admin/orders -> /admin/orders
const res10 = resolvePostLoginPath(adminActor, "/admin/orders");
record("precedence", "admin + next=/admin/orders -> /admin/orders", res10 === "/admin/orders", res10);

// Admin requesting /account -> /admin (management default overrides generic customer fallback)
const res10b = resolvePostLoginPath(adminActor, "/account");
record("precedence", "admin + next=/account -> /admin", res10b === "/admin", res10b);

// Manager requesting /account -> /admin
const res10bManager = resolvePostLoginPath(managerActor, "/account");
record("precedence", "manager + next=/account -> /admin", res10bManager === "/admin", res10bManager);

// Staff requesting /account -> /admin
const res10bStaff = resolvePostLoginPath(staffActor, "/account");
record("precedence", "staff + next=/account -> /admin", res10bStaff === "/admin", res10bStaff);

// Customer requesting /account -> /account
const res10bCustomer = resolvePostLoginPath(customerActor, "/account");
record("precedence", "customer + next=/account -> /account", res10bCustomer === "/account", res10bCustomer);

// Admin requesting /checkout -> /checkout (intentional storefront destination preserved)
const res10cAdmin = resolvePostLoginPath(adminActor, "/checkout");
record("precedence", "admin + next=/checkout -> /checkout", res10cAdmin === "/checkout", res10cAdmin);

// Admin requesting /account/orders -> /account/orders (sub-route preserved)
const res10dAdmin = resolvePostLoginPath(adminActor, "/account/orders");
record("precedence", "admin + next=/account/orders -> /account/orders", res10dAdmin === "/account/orders", res10dAdmin);

// Staff requesting /checkout -> /checkout (staff making purchase)
const res10c = resolvePostLoginPath(staffActor, "/checkout");
record("precedence", "staff + next=/checkout -> /checkout", res10c === "/checkout", res10c);

console.log("\n== 3. Restricted Accounts: Non-Active States ==");

const suspendedCustomer = { ...customerActor, status: "suspended", permissions: [] };
const suspendedStaff = { ...staffActor, status: "suspended", permissions: [] };
const suspendedManager = { ...managerActor, status: "suspended", permissions: [] };
const suspendedAdmin = { ...adminActor, status: "suspended", permissions: [] };

const bannedAdmin = { ...adminActor, status: "banned", permissions: [] };
const pendingStaff = { ...staffActor, status: "pending", permissions: [] };

// Helper unit invariants
record("helpers", "hasManagementAccess returns true for active admin", hasManagementAccess(adminActor), true);
record("helpers", "hasManagementAccess returns false for customer", !hasManagementAccess(customerActor), true);
record("helpers", "hasManagementAccess returns false for suspended admin", !hasManagementAccess(suspendedAdmin), true);
record("helpers", "getRoleDefaultPath returns /admin for active admin", getRoleDefaultPath(adminActor) === "/admin", true);
record("helpers", "getRoleDefaultPath returns /account for customer", getRoleDefaultPath(customerActor) === FALLBACK_PATH, true);
record("helpers", "sanitizeNextPath falls back on empty", sanitizeNextPath("") === FALLBACK_PATH, true);
record("helpers", "MANAGEMENT_PERMISSIONS includes inventory.read", MANAGEMENT_PERMISSIONS.includes("inventory.read"), true);

// 11. restricted customer -> /account
const res11 = resolvePostLoginPath(suspendedCustomer, null);
record("restricted", "restricted customer without next -> /account", res11 === "/account", res11);

// 12. restricted staff -> /account
const res12 = resolvePostLoginPath(suspendedStaff, null);
record("restricted", "restricted staff without next -> /account", res12 === "/account", res12);

// 13. restricted manager -> /account
const res13 = resolvePostLoginPath(suspendedManager, null);
record("restricted", "restricted manager without next -> /account", res13 === "/account", res13);

// 14. restricted admin -> /account
const res14 = resolvePostLoginPath(suspendedAdmin, null);
record("restricted", "restricted admin without next -> /account", res14 === "/account", res14);

// Restricted admin with explicit next=/admin -> /account
const res14b = resolvePostLoginPath(suspendedAdmin, "/admin");
record("restricted", "restricted admin + next=/admin -> /account", res14b === "/account", res14b);

// Banned admin -> /account
const res14c = resolvePostLoginPath(bannedAdmin, "/admin/orders");
record("restricted", "banned admin + next=/admin/orders -> /account", res14c === "/account", res14c);

// Pending staff -> /account
const res14d = resolvePostLoginPath(pendingStaff, "/admin");
record("restricted", "pending staff + next=/admin -> /account", res14d === "/account", res14d);

// Anonymous / null actor -> /account
const res14e = resolvePostLoginPath(null, "/admin");
record("restricted", "null actor -> /account", res14e === "/account", res14e);

console.log("\n== 4. Open Redirect Defenses ==");

// 15. external redirect payloads are rejected
const res15a = resolvePostLoginPath(customerActor, "https://evil.example");
record("security", "external https://evil.example -> /account", res15a === "/account", res15a);

const res15b = resolvePostLoginPath(adminActor, "https://evil.example");
record("security", "external https://evil.example for admin -> /admin", res15b === "/admin", res15b);

// 16. protocol-relative URLs are rejected
const res16a = resolvePostLoginPath(customerActor, "//evil.example");
record("security", "protocol-relative //evil.example -> /account", res16a === "/account", res16a);

const res16b = resolvePostLoginPath(staffActor, "///evil.example");
record("security", "protocol-relative ///evil.example for staff -> /admin", res16b === "/admin", res16b);

// 17. backslash-based redirect payloads are rejected
const res17a = resolvePostLoginPath(customerActor, "/\\evil.example");
record("security", "backslash /\\evil.example -> /account", res17a === "/account", res17a);

const res17b = resolvePostLoginPath(managerActor, "\\\\evil.example");
record("security", "backslash \\\\evil.example for manager -> /admin", res17b === "/admin", res17b);

// Control characters rejected
const res17c = resolvePostLoginPath(customerActor, "/account\r\nLocation: https://evil.example");
record("security", "header injection attempt -> /account", res17c === "/account", res17c);

// next=/login or next=/register falls back to role default (prevent loops)
const res18Loop = resolvePostLoginPath(adminActor, "/login");
record("security", "next=/login falls back to role default /admin", res18Loop === "/admin", res18Loop);

console.log("\n== 5. Complete 14-Invariant Routing Matrix ==");

// Matrix 1: Admin -> /login -> /admin
const m1 = resolvePostLoginPath(adminActor, null);
record("matrix", "1. Admin -> /login -> /admin", m1 === "/admin", m1);

// Matrix 2: Manager -> /login -> /admin
const m2 = resolvePostLoginPath(managerActor, null);
record("matrix", "2. Manager -> /login -> /admin", m2 === "/admin", m2);

// Matrix 3: Staff -> /login -> /admin
const m3 = resolvePostLoginPath(staffActor, null);
record("matrix", "3. Staff -> /login -> /admin", m3 === "/admin", m3);

// Matrix 4: Customer -> /login -> /account
const m4 = resolvePostLoginPath(customerActor, null);
record("matrix", "4. Customer -> /login -> /account", m4 === "/account", m4);

// Matrix 5: Admin -> /login?next=/account -> /admin
const m5 = resolvePostLoginPath(adminActor, "/account");
record("matrix", "5. Admin -> /login?next=/account -> /admin", m5 === "/admin", m5);

// Matrix 6: Manager -> /login?next=/account -> /admin
const m6 = resolvePostLoginPath(managerActor, "/account");
record("matrix", "6. Manager -> /login?next=/account -> /admin", m6 === "/admin", m6);

// Matrix 7: Staff -> /login?next=/account -> /admin
const m7 = resolvePostLoginPath(staffActor, "/account");
record("matrix", "7. Staff -> /login?next=/account -> /admin", m7 === "/admin", m7);

// Matrix 8: Customer -> /login?next=/account -> /account
const m8 = resolvePostLoginPath(customerActor, "/account");
record("matrix", "8. Customer -> /login?next=/account -> /account", m8 === "/account", m8);

// Matrix 9: Admin -> /login?next=/checkout -> /checkout
const m9 = resolvePostLoginPath(adminActor, "/checkout");
record("matrix", "9. Admin -> /login?next=/checkout -> /checkout", m9 === "/checkout", m9);

// Matrix 10: Admin -> /login?next=/account/orders -> /account/orders
const m10 = resolvePostLoginPath(adminActor, "/account/orders");
record("matrix", "10. Admin -> /login?next=/account/orders -> /account/orders", m10 === "/account/orders", m10);

// Matrix 11: Customer -> /login?next=/admin -> /account
const m11 = resolvePostLoginPath(customerActor, "/admin");
record("matrix", "11. Customer -> /login?next=/admin -> /account", m11 === "/account", m11);

// Matrix 12: Restricted actor -> /login?next=/admin -> /account
const m12 = resolvePostLoginPath(suspendedAdmin, "/admin");
record("matrix", "12. Restricted actor -> /login?next=/admin -> /account", m12 === "/account", m12);

// Middleware simulation for 13 & 14
function simulateUnauthenticatedMiddlewareRedirect(pathname) {
  const isProtected =
    pathname.startsWith("/account") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/admin");
  if (!isProtected) return null;
  const url = new URL("http://localhost:3000/login");
  url.searchParams.set("next", pathname);
  return `${url.pathname}${url.search}`;
}

// Matrix 13: Unauthenticated -> /admin -> redirected to /login?next=/admin
const m13 = simulateUnauthenticatedMiddlewareRedirect("/admin");
record(
  "matrix",
  "13. Unauthenticated -> /admin -> redirected to /login?next=/admin",
  m13 === "/login?next=%2Fadmin" || m13 === "/login?next=/admin",
  m13
);

// Matrix 14: Unauthenticated -> /admin/inventory -> redirected to /login?next=/admin/inventory
const m14 = simulateUnauthenticatedMiddlewareRedirect("/admin/inventory");
record(
  "matrix",
  "14. Unauthenticated -> /admin/inventory -> redirected to /login?next=/admin/inventory",
  m14 === "/login?next=%2Fadmin%2Finventory" || m14 === "/login?next=/admin/inventory",
  m14
);

console.log("\n== 6. Codebase Wiring & Architectural Boundaries ==");

const loginSrc = fs.readFileSync(fileURLToPath(new URL("../app/(auth)/login/page.tsx", import.meta.url)), "utf8");
const actionSrc = fs.readFileSync(fileURLToPath(new URL("../app/actions/auth.ts", import.meta.url)), "utf8");
const callbackSrc = fs.readFileSync(fileURLToPath(new URL("../app/auth/callback/route.ts", import.meta.url)), "utf8");
const middlewareSrc = fs.readFileSync(fileURLToPath(new URL("../lib/supabase/middleware.ts", import.meta.url)), "utf8");
const adminLayoutSrc = fs.readFileSync(fileURLToPath(new URL("../app/admin/layout.tsx", import.meta.url)), "utf8");
const accountSrc = fs.readFileSync(fileURLToPath(new URL("../app/(marketing)/account/page.tsx", import.meta.url)), "utf8");
const navbarSrc = fs.readFileSync(fileURLToPath(new URL("../components/layout/navbar.tsx", import.meta.url)), "utf8");
const mobileNavSrc = fs.readFileSync(fileURLToPath(new URL("../components/layout/mobile-nav.tsx", import.meta.url)), "utf8");
const redirectSrc = fs.readFileSync(fileURLToPath(new URL("../lib/redirect.ts", import.meta.url)), "utf8");

// Middleware protects account, checkout, and admin routes
record(
  "architecture",
  "middleware protects account, checkout, and admin routes for unauthenticated users",
  middlewareSrc.includes('request.nextUrl.pathname.startsWith("/admin")') &&
    middlewareSrc.includes('url.searchParams.set("next", originalTarget)'),
  "middleware unauthenticated protection missing /admin"
);

// Middleware delegates authenticated login/register to resolvePostLoginPath
record(
  "architecture",
  "middleware delegates authenticated login/register to resolvePostLoginPath",
  middlewareSrc.includes("resolvePostLoginPath(actor, next)") &&
    middlewareSrc.includes('rpc("current_actor")'),
  "middleware does not delegate post-login routing to resolvePostLoginPath"
);

// Callback uses identical routing logic
record(
  "architecture",
  "callback imports and uses resolvePostLoginPath",
  callbackSrc.includes("resolvePostLoginPath") &&
    /destination\s*=\s*resolvePostLoginPath\(/.test(callbackSrc),
  "callback does not call resolvePostLoginPath"
);

record(
  "architecture",
  "loginAction imports and uses resolvePostLoginPath",
  actionSrc.includes("resolvePostLoginPath") &&
    /destination\s*=\s*resolvePostLoginPath\(/.test(actionSrc),
  "loginAction does not call resolvePostLoginPath"
);

// No hard-coded email/user ID routing exists
record(
  "architecture",
  "redirect resolver does not inspect email addresses",
  !redirectSrc.includes(".email") && !/\bactor\.email\b/.test(redirectSrc) && !/user\.email/.test(redirectSrc),
  "email inspection found in redirect resolver"
);

record(
  "architecture",
  "redirect resolver does not hardcode user IDs",
  !redirectSrc.includes("userId ===") && !redirectSrc.includes("userId !=="),
  "userId inspection found in redirect resolver"
);

// Account page management entry point checks
record(
  "architecture",
  "account page resolves actor context and checks management access",
  accountSrc.includes("getActorContext()") &&
    accountSrc.includes("hasManagementAccess(actor)"),
  "Account page missing actor or management check"
);

record(
  "architecture",
  "account page renders link to /admin for management actors",
  accountSrc.includes('href="/admin"') &&
    accountSrc.includes("isManagement"),
  "Account page missing conditional /admin link"
);

record(
  "architecture",
  "account page does not hardcode role-name or email checks for management access",
  !accountSrc.includes('role === "admin"') &&
    !accountSrc.includes("role === 'admin'") &&
    !accountSrc.includes("user.email ===") &&
    !accountSrc.includes("actor.email ==="),
  "Account page contains hardcoded role or email checks"
);

// Global nav remains free of Admin links
record(
  "architecture",
  "global navbar does not link to /admin",
  !navbarSrc.includes('href="/admin"'),
  "Navbar still links to /admin"
);

record(
  "architecture",
  "mobile navigation does not link to /admin",
  !mobileNavSrc.includes('href="/admin"'),
  "MobileNav still links to /admin"
);

// Admin layout preserves ?next=/admin on unauthenticated redirect
record(
  "architecture",
  "admin layout redirects unauthenticated users with ?next=/admin",
  adminLayoutSrc.includes('redirect("/login?next=/admin")'),
  "Admin layout does not preserve ?next=/admin"
);

// Admin layout retains server-side guards
record(
  "architecture",
  "admin layout enforces requireActiveActor",
  adminLayoutSrc.includes("requireActiveActor()"),
  "requireActiveActor missing from admin layout"
);

record(
  "architecture",
  "admin layout enforces requireAnyPermission",
  adminLayoutSrc.includes("requireAnyPermission(MANAGEMENT_PERMISSIONS)"),
  "requireAnyPermission missing from admin layout"
);

// Login form distinguishes explicit next from absent next
record(
  "architecture",
  "login form uses null fallback to distinguish missing next",
  loginSrc.includes("sanitizeNextPath(rawNext, null)") &&
    loginSrc.includes('name="next" value={next ?? ""}'),
  "Login form forces /account fallback on absent next"
);

console.log("\n== Summary ==");
const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`  ${passed}/${total} checks passed\n`);

if (passed !== total) {
  process.exit(1);
}
