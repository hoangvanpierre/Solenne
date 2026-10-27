#!/usr/bin/env node
// ===========================================================================
// Solenne — Verification Harness for the Management Shell (Phase 3)
// ===========================================================================
// Static, dependency-free regression checks over the shared admin surface.
// There is no browser, no authenticated session and no database involved:
// every assertion is a source invariant over the checkout under review.
//
//   A. Layout boundary & shell wiring
//   B. Route-content transition isolation (sidebar/header never animate)
//   C. Mobile drawer + keyboard accessibility
//   D. Sign-out control (compact label, untouched server action)
//   E. Navigation model & permission filtering
//   F. Route authorization cross-check (nav entry <-> page gate)
//   G. Detail / create route gates
//   H. Trusted identity (no client-controlled role; hiding != enforcing)
//   I. Shared admin component inventory & page integration
//   J. Bilingual labels & route-driven filtering/pagination
//   K. Motion, reduced motion, focus scoping, no sidebar accent line
//   L. Request-scoped session / authorization performance invariants
//
// Conventions match the other scripts/verify-*.mjs harnesses: plain Node,
// `[PASS]`/`[FAIL]` lines, a summary, and a non-zero exit code on failure.
//
// Deliberate limitation: this harness cannot observe rendering, focus order,
// computed CSS, or hydrated interaction. Those require an authenticated
// browser session and are listed in the final report, not faked here.
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
    console.error(`  [FAIL] ${description}${detail ? ` -> ${detail}` : ""}`);
  }
}

const REPO = new URL("../", import.meta.url);

// Normalize CRLF -> LF so line-ending differences between checkouts never
// change a result.
function readSource(target) {
  return fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
}

function fileUrl(relativePath) {
  return new URL(relativePath, REPO);
}

function exists(relativePath) {
  return fs.existsSync(fileUrl(relativePath));
}

function read(relativePath) {
  return readSource(fileUrl(relativePath));
}

/**
 * Source text of the block whose opening `{` follows `marker`, matched by
 * balanced braces. Used so assertions inspect a real block instead of a
 * fixed character window.
 */
function braceBlockAfter(source, markerOrIndex) {
  const start =
    typeof markerOrIndex === "number"
      ? markerOrIndex
      : source.indexOf(markerOrIndex);
  if (start === -1) return "";
  const open = source.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return "";
}

/**
 * The full `<div ...>...</div>` element that carries `marker`, found by
 * balancing nested `<div` / `</div>` tags from that opening tag.
 */
function divElementContaining(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return "";
  const open = source.lastIndexOf("<div", markerIndex);
  if (open === -1) return "";

  let depth = 0;
  const tagPattern = /<div\b|<\/div\s*>/g;
  tagPattern.lastIndex = open;
  let match;
  while ((match = tagPattern.exec(source))) {
    if (match[0].startsWith("</")) {
      depth--;
      if (depth === 0) return source.slice(open, tagPattern.lastIndex);
    } else {
      depth++;
    }
  }
  return "";
}

/** Module specifiers of the import statements in a source file. */
function importSources(source) {
  return [...source.matchAll(/^\s*import\s+(?:type\s+)?[^;]*?from\s+"([^"]+)"/gm)].map(
    (match) => match[1]
  );
}

/**
 * Remove block and line comments so "does this file call X" assertions cannot
 * be satisfied (or defeated) by prose. The `[^:]` guard keeps `https://` intact.
 */
function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Number of real `supabase.auth.getUser()` calls (comments excluded). */
function verifiedUserCallCount(source) {
  return (
    stripJsComments(source).match(/(?:supabase|client)\.auth\.getUser\(\)/g) ?? []
  ).length;
}

/**
 * Selector text of the rule that contains `index` (CSS, comments removed).
 * Handles both a token inside the selector and a declaration inside the block.
 */
function cssSelectorAt(css, index) {
  const lastOpen = css.lastIndexOf("{", index);
  const lastBoundary = Math.max(
    css.lastIndexOf("}", index),
    css.lastIndexOf(";", index)
  );
  const cursor = lastOpen > lastBoundary ? lastOpen : index;
  let start = cursor;
  while (start > 0 && !"};".includes(css[start - 1])) start--;
  return css.slice(start, cursor).trim().replace(/\s+/g, " ");
}

/** Every block belonging to `marker`, matched by balanced braces. */
function cssBlocksAfter(css, marker) {
  const blocks = [];
  for (
    let index = css.indexOf(marker);
    index !== -1;
    index = css.indexOf(marker, index + 1)
  ) {
    const block = braceBlockAfter(css, index);
    if (block) blocks.push(block);
  }
  return blocks;
}

/** The `@media (prefers-reduced-motion: reduce)` block that mentions `needle`. */
function reducedMotionBlockFor(css, needle) {
  return cssBlocksAfter(css, "@media (prefers-reduced-motion: reduce)").find(
    (block) => block.includes(needle)
  ) ?? "";
}

/** [ids, classes+attrs+pseudos, elements] for the two selectors compared below. */
function selectorSpecificity(selector) {
  const ids = (selector.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (selector.match(/\.[\w-]+/g) ?? []).length +
    (selector.match(/\[[^\]]*\]/g) ?? []).length +
    (selector.match(/:(?!:)[\w-]+(?:\([^)]*\))?/g) ?? []).length;
  const stripped = selector.replace(
    /[#.][\w-]+|\[[^\]]*\]|::?[\w-]+(?:\([^)]*\))?/g,
    " "
  );
  const elements = (stripped.match(/\b[a-z][\w-]*\b/gi) ?? []).length;
  return [ids, classes, elements];
}

function outranks(candidate, incumbent) {
  for (let i = 0; i < 3; i++) {
    if (candidate[i] !== incumbent[i]) return candidate[i] > incumbent[i];
  }
  return false;
}

/** Permission keys a server page demands through lib/authz.ts. */
function pageGates(source) {
  const permissions = new Set();

  for (const call of source.matchAll(/requirePermission\(\s*"([^"]+)"/g)) {
    permissions.add(call[1]);
  }
  for (const call of source.matchAll(/requireAnyPermission\(\s*\[([^\]]*)\]/g)) {
    for (const key of call[1].matchAll(/"([^"]+)"/g)) permissions.add(key[1]);
  }

  return {
    permissions,
    usesManagementList: /requireAnyPermission\(\s*MANAGEMENT_PERMISSIONS\s*\)/.test(
      source
    ),
    callsRequire: /requirePermission\(|requireAnyPermission\(/.test(source),
  };
}

function isSubset(subset, superset) {
  for (const value of subset) {
    if (!superset.has(value)) return false;
  }
  return true;
}

function sortedList(values) {
  return [...values].sort().join(", ");
}

// ---------------------------------------------------------------------------
console.log("== A. Layout Boundary & Shell Wiring ==");
// ---------------------------------------------------------------------------
const layoutPath = "app/admin/layout.tsx";
const shellPath = "components/admin/admin-shell.tsx";
const sidebarPath = "components/admin/admin-sidebar-nav.tsx";
const navPath = "lib/admin-nav.ts";
const globalsPath = "app/globals.css";

for (const required of [layoutPath, shellPath, sidebarPath, navPath, globalsPath]) {
  assert(`${required} exists`, exists(required), required);
}

const layout = read(layoutPath);
const shell = read(shellPath);
const sidebar = read(sidebarPath);
const nav = read(navPath);
const globals = read(globalsPath);

assert(
  "admin layout is a Server Component (no client directive)",
  !/^\s*["']use client["']/m.test(layout),
  "app/admin/layout.tsx must stay on the server"
);
assert(
  "admin layout is the authorization gate (requireActiveActor)",
  /await\s+requireActiveActor\(\)/.test(layout)
);
assert(
  "admin layout requires a management permission",
  /await\s+requireAnyPermission\(\s*MANAGEMENT_PERMISSIONS\s*\)/.test(layout)
);
assert(
  "admin layout imports AdminShell from the component barrel",
  /import\s*\{\s*AdminShell\s*\}\s*from\s*"@\/components\/admin"/.test(layout)
);
assert("admin layout renders <AdminShell>", layout.includes("<AdminShell"));
assert(
  "shell receives groups already filtered by the actor's permissions",
  /groups=\{\s*filterAdminNav\(\s*actor\.permissions\s*\)\s*\}/.test(layout)
);
assert(
  "display identity comes from the server identity helper",
  /import\s*\{\s*getAdminShellIdentity\s*\}\s*from\s*"@\/lib\/admin-identity"/.test(
    layout
  ) && /await\s+getAdminShellIdentity\(\)/.test(layout)
);
assert(
  "role label is derived from the trusted actor context",
  /ROLE_LABELS\[actor\.role\]/.test(layout)
);
assert(
  "layout redirects unauthenticated callers to /login?next=/admin",
  /isUnauthenticatedAuthError\(error\)\)\s*redirect\("\/login\?next=\/admin"\)/.test(
    layout
  )
);
assert(
  "layout renders the restricted-account notice for disabled accounts",
  layout.includes("<RestrictedAccountNotice")
);
assert(
  "layout fails closed when no actor is available",
  /if\s*\(!actor\)\s*\{[\s\S]{0,160}throw new Error/.test(layout)
);
assert(
  "management area does not mount storefront chrome (Navbar/Footer/SmoothScroll)",
  !["Navbar", "Footer", "SmoothScroll"].some((name) =>
    new RegExp(`import[^;]*\\b${name}\\b[^;]*from`, "m").test(layout)
  )
);
assert(
  "admin layout scopes the back-office styling with .admin-scope",
  /className="[^"]*admin-scope/.test(layout)
);

// ---------------------------------------------------------------------------
console.log("\n== B. Route-Content Transition Isolation ==");
// ---------------------------------------------------------------------------
assert(
  "admin shell is a Client Component (interactive chrome only)",
  shell.trimStart().startsWith('"use client"')
);

const transitionBlock = divElementContaining(shell, 'className="admin-page-enter"');
const transitionOpenTag = transitionBlock
  ? transitionBlock.slice(0, transitionBlock.indexOf(">") + 1)
  : "";

assert(
  "route content is wrapped in the admin-page-enter transition",
  transitionBlock.length > 0,
  "no element carries className=\"admin-page-enter\""
);
assert(
  "transition wrapper is keyed by the pathname",
  /key=\{pathname\}/.test(transitionOpenTag),
  transitionOpenTag
);
assert(
  "transition wrapper contains the route content",
  transitionBlock.includes("{children}")
);
assert(
  "persistent sidebar is outside the animated wrapper",
  !transitionBlock.includes("<aside") &&
    !transitionBlock.includes("<AdminSidebarNav")
);
assert(
  "persistent top bar is outside the animated wrapper",
  !transitionBlock.includes("<header")
);
assert(
  "transition wrapper is not keyed on query-string state",
  !/key=\{[^}]*[sS]earchParams/.test(transitionOpenTag) &&
    !/key=\{[^}]*[sS]earch\b/.test(transitionOpenTag)
);
assert(
  "shell does not subscribe to search params",
  !shell.includes("useSearchParams"),
  "query-string changes must not remount the chrome"
);
assert(
  "shell resolves the active section from usePathname",
  /import\s*\{[^}]*\busePathname\b[^}]*\}\s*from\s*"next\/navigation"/.test(shell)
);
assert(
  "sidebar and header are rendered before the animated main wrapper",
  shell.indexOf("<aside") !== -1 &&
    shell.indexOf("<header") !== -1 &&
    shell.indexOf("<aside") < shell.indexOf('id="admin-main"') &&
    shell.indexOf("<header") < shell.indexOf('id="admin-main"')
);
assert(
  "main region exposes the skip-link target",
  /id="admin-main"/.test(shell) && /href="#admin-main"/.test(shell)
);

// ---------------------------------------------------------------------------
console.log("\n== C. Mobile Drawer & Keyboard Accessibility ==");
// ---------------------------------------------------------------------------
assert(
  "drawer is mounted through AnimatePresence",
  /<AnimatePresence>/.test(shell) && shell.includes("exit={{")
);
assert(
  "drawer is an accessible modal dialog",
  /role="dialog"/.test(shell) &&
    /aria-modal="true"/.test(shell) &&
    /aria-label=\{isVi \?/.test(shell)
);
assert(
  "drawer trigger and panel share matching aria-controls/id",
  /aria-controls="admin-mobile-nav"/.test(shell) &&
    /id="admin-mobile-nav"/.test(shell)
);
assert(
  "drawer trigger exposes expanded state",
  /aria-expanded=\{isDrawerOpen\}/.test(shell)
);
assert(
  "Escape closes the drawer",
  /event\.key === "Escape"[\s\S]{0,160}setIsDrawerOpen\(false\)/.test(shell)
);
assert(
  "Tab is trapped inside the open drawer",
  /event\.key !== "Tab"/.test(shell) &&
    /event\.shiftKey/.test(shell) &&
    /first\.focus\(\)/.test(shell) &&
    /last\.focus\(\)/.test(shell)
);
assert(
  "focusable selector covers links, buttons and form controls",
  ["a[href]", "button:not([disabled])", "input:not([disabled])", "select", "textarea"].every(
    (fragment) => shell.includes(fragment)
  )
);
assert(
  "focus returns to the trigger only after the drawer was opened",
  /wasOpenedRef/.test(shell) && /triggerRef\.current\?\.focus\(\)/.test(shell)
);
assert(
  "drawer locks body scroll through the shared hook",
  /useLockedBody\(isDrawerOpen\)/.test(shell) &&
    /import\s*\{\s*useLockedBody\s*\}\s*from\s*"@\/hooks\/use-locked-body"/.test(
      shell
    )
);
assert(
  "drawer motion respects prefers-reduced-motion",
  /useReducedMotion\(\)/.test(shell) &&
    /prefersReducedMotion \? 0 :/.test(shell)
);

// ---------------------------------------------------------------------------
console.log("\n== D. Sign-Out Control ==");
// ---------------------------------------------------------------------------
assert(
  "shell imports the existing signOutAction server action",
  /import\s*\{\s*signOutAction\s*\}\s*from\s*"@\/app\/actions\/auth"/.test(shell)
);
assert(
  "sign-out is submitted through a form bound to that action",
  /<form\s+action=\{signOutAction\}/.test(shell)
);
assert(
  "sign-out button is a submit control",
  /type="submit"/.test(shell) &&
    /<form\s+action=\{signOutAction\}[^>]*>[\s\S]{0,200}<button[\s\S]{0,120}type="submit"/.test(
      shell
    )
);
assert(
  "sign-out label stays bilingual",
  /isVi \? "Đăng xuất" : "Sign out"/.test(shell)
);
assert(
  "sign-out label uses the compact 11px admin type scale",
  /admin-logout-button[^"]*text-\[11px\]/.test(shell),
  "expected text-[11px] on the logout button"
);
assert(
  "sign-out control cannot wrap onto a second line",
  /admin-logout-button[^"]*whitespace-nowrap/.test(shell) &&
    /<span className="whitespace-nowrap">/.test(shell)
);
assert(
  "sign-out control is named with the dedicated hook class",
  /className="admin-logout-button /.test(shell)
);
assert(
  "shell never imports the secret-key admin client",
  !importSources(shell).some((source) => source.includes("supabase/admin")),
  "the shell must not gain privileged database access"
);

const logoutRuleMarker = ".admin-scope form button.admin-logout-button";
const sharedPillMarker = ".admin-scope button.rounded-full";
const logoutRuleIndex = globals.indexOf(logoutRuleMarker);
const sharedPillIndex = globals.indexOf(sharedPillMarker);
const logoutRule = logoutRuleIndex === -1 ? "" : braceBlockAfter(globals, logoutRuleIndex);
const sharedPillRule =
  sharedPillIndex === -1 ? "" : braceBlockAfter(globals, sharedPillIndex);

assert("logout exception rule exists", logoutRule.length > 0, logoutRuleMarker);
assert(
  "logout exception keeps the control compact (24px, 2px padding)",
  /min-height:\s*1\.5rem/.test(logoutRule) &&
    /padding-top:\s*0\.125rem/.test(logoutRule) &&
    /padding-bottom:\s*0\.125rem/.test(logoutRule)
);
assert(
  "shared rounded-pill rule is not weakened for every control",
  /min-height:\s*2\.25rem/.test(sharedPillRule),
  "the shared rule must keep its 36px sizing"
);
assert(
  "logout exception outranks the shared pill rule on specificity",
  outranks(
    selectorSpecificity(logoutRuleMarker),
    selectorSpecificity(sharedPillMarker)
  ),
  `${selectorSpecificity(logoutRuleMarker).join("-")} vs ${selectorSpecificity(
    sharedPillMarker
  ).join("-")}`
);

const authActions = read("app/actions/auth.ts");
assert(
  "signOutAction still signs the session out on the server",
  /^"use server";/.test(authActions.trimStart()) &&
    /export async function signOutAction\(\): Promise<void>/.test(authActions) &&
    /supabase\.auth\.signOut\(\)/.test(authActions) &&
    /redirect\("\/"\)/.test(authActions)
);

// ---------------------------------------------------------------------------
console.log("\n== E. Navigation Model & Permission Filtering ==");
// ---------------------------------------------------------------------------
assert(
  "navigation model exports the group table",
  /export const ADMIN_NAV_GROUPS/.test(nav)
);
assert(
  "navigation model exports filterAdminNav",
  /export function filterAdminNav\(/.test(nav)
);
assert(
  "filtering is driven by the actor's permission set",
  /new Set<PermissionKey>\(permissions\)/.test(nav) ||
    /new Set\(permissions\)/.test(nav)
);
assert(
  "an item is visible when ANY of its required permissions is held",
  /item\.requires\.some\(/.test(nav)
);
assert(
  "groups left without items are dropped",
  /filter\(\(group\) => group\.items\.length > 0\)/.test(nav)
);
assert(
  "active-section resolution prefers the longest matching prefix",
  /item\.href\.length > best\.href\.length/.test(nav) &&
    /current\.startsWith\(`\$\{item\.href\}\/`\)/.test(nav)
);

// Parse the item table from source so role/permission knowledge stays in
// lib/admin-nav.ts rather than being duplicated in this harness.
const navItems = [];
for (const hrefMatch of nav.matchAll(/href:\s*"(\/admin[^"]*)"/g)) {
  const open = nav.lastIndexOf("{", hrefMatch.index);
  const close = nav.indexOf("}", hrefMatch.index);
  const block = open === -1 || close === -1 ? "" : nav.slice(open, close);
  const requiresMatch = /requires:\s*\[([^\]]*)\]/.exec(block);
  navItems.push({
    id: (/id:\s*"([^"]+)"/.exec(block) ?? [])[1] ?? "",
    href: hrefMatch[1],
    label: (/label:\s*"([^"]+)"/.exec(block) ?? [])[1] ?? "",
    labelVi: (/labelVi:\s*"([^"]+)"/.exec(block) ?? [])[1] ?? "",
    match: (/match:\s*"(exact|prefix)"/.exec(block) ?? [])[1] ?? "",
    requires: requiresMatch
      ? [...requiresMatch[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1])
      : null,
  });
}

assert(
  "navigation entries were parsed from the model",
  navItems.length >= 6,
  `found ${navItems.length}`
);
assert(
  "every navigation entry is fully described",
  navItems.every(
    (item) =>
      item.id && item.href && item.label && item.labelVi && item.match && item.requires
  ),
  navItems.filter((item) => !item.requires).map((item) => item.href).join(", ")
);
assert(
  "every navigation entry has a distinct Vietnamese label",
  navItems.every((item) => item.label !== item.labelVi),
  navItems.filter((item) => item.label === item.labelVi).map((item) => item.href).join(", ")
);
assert(
  "navigation ids are unique",
  new Set(navItems.map((item) => item.id)).size === navItems.length
);
assert(
  "every navigation target resolves to an existing page",
  navItems.every((item) => exists(`app${item.href}/page.tsx`)),
  navItems
    .filter((item) => !exists(`app${item.href}/page.tsx`))
    .map((item) => item.href)
    .join(", ")
);
assert(
  "no navigation entry advertises an unimplemented back-office module",
  navItems.every(
    (item) =>
      !/\/(staff|roles?|permissions|users|settings|billing|payments?|stripe)\b/.test(
        item.href
      )
  ),
  navItems.map((item) => item.href).join(", ")
);

// Every implemented top-level management page must be reachable from the rail.
const discoveredAdminPages = [];
(function walk(relativeDir) {
  const dirUrl = fileUrl(relativeDir);
  for (const entry of fs.readdirSync(dirUrl, { withFileTypes: true })) {
    const child = `${relativeDir}${entry.name}`;
    if (entry.isDirectory()) {
      walk(`${child}/`);
    } else if (entry.name === "page.tsx") {
      const route = `/${child}`.replace(/\/page\.tsx$/, "").replace(/^\/app/, "");
      discoveredAdminPages.push(route);
    }
  }
})("app/admin/");

const listRoutes = discoveredAdminPages.filter(
  (route) => !route.includes("[") && !route.endsWith("/new")
);
const advertisedHrefs = new Set(navItems.map((item) => item.href));
assert(
  "every top-level management page is reachable from the sidebar",
  listRoutes.every((route) => advertisedHrefs.has(route)),
  listRoutes.filter((route) => !advertisedHrefs.has(route)).join(", ")
);

// ---------------------------------------------------------------------------
console.log("\n== F. Route Authorization Cross-Check ==");
// ---------------------------------------------------------------------------
const pageSources = new Map();
function pageSource(route) {
  if (!pageSources.has(route)) {
    pageSources.set(route, read(`app${route}/page.tsx`));
  }
  return pageSources.get(route);
}

for (const item of navItems) {
  const source = pageSource(item.href);
  const gates = pageGates(source);

  if (item.requires.length === 0) {
    assert(
      `route ${item.href} is gated by the management permission list`,
      gates.usesManagementList,
      "an entry with no specific permission must still gate on MANAGEMENT_PERMISSIONS"
    );
    continue;
  }

  const navSet = new Set(item.requires);
  assert(
    `route ${item.href} enforces the same permissions as its nav entry (${sortedList(
      navSet
    )})`,
    gates.permissions.size === navSet.size && isSubset(navSet, gates.permissions),
    `page gates: ${sortedList(gates.permissions) || "none"}`
  );
}

assert(
  "every management page re-checks authorization server-side",
  listRoutes.every((route) => {
    const gates = pageGates(pageSource(route));
    return gates.callsRequire || gates.usesManagementList;
  }),
  listRoutes
    .filter((route) => {
      const gates = pageGates(pageSource(route));
      return !gates.callsRequire && !gates.usesManagementList;
    })
    .join(", ")
);
assert(
  "audit visibility follows the audit.read permission",
  pageGates(pageSource("/admin/audit")).permissions.has("audit.read") &&
    new Set(navItems.find((item) => item.href === "/admin/audit")?.requires ?? [])
      .size === 1
);
assert(
  "management pages surface authorization failures (AuthError handling)",
  listRoutes.every((route) => /error instanceof AuthError/.test(pageSource(route))),
  listRoutes
    .filter((route) => !/error instanceof AuthError/.test(pageSource(route)))
    .join(", ")
);
assert(
  "no page treats the filtered navigation as its authorization source",
  ![...pageSources.values()].some((source) =>
    /filterAdminNav|ADMIN_NAV_GROUPS/.test(source)
  )
);

// ---------------------------------------------------------------------------
console.log("\n== G. Detail & Create Route Gates ==");
// ---------------------------------------------------------------------------
const detailRoutes = [
  { route: "/admin/orders/[id]", moduleRoute: "/admin/orders" },
  { route: "/admin/customers/[id]", moduleRoute: "/admin/customers" },
  { route: "/admin/products/[id]", moduleRoute: "/admin/products" },
  { route: "/admin/products/new", moduleRoute: "/admin/products" },
];

for (const { route, moduleRoute } of detailRoutes) {
  const moduleNav = navItems.find((entry) => entry.href === moduleRoute);
  const moduleGate = new Set(moduleNav?.requires ?? []);
  const gates = pageGates(pageSource(route));

  assert(
    `detail route ${route} exists`,
    exists(`app${route}/page.tsx`)
  );
  assert(
    `detail route ${route} enforces a permission from its module's gate`,
    gates.permissions.size > 0 && isSubset(gates.permissions, moduleGate),
    `page gates: ${sortedList(gates.permissions) || "none"}; module gate: ${sortedList(
      moduleGate
    )}`
  );
  assert(
    `detail route ${route} redirects unauthenticated callers`,
    /isUnauthenticatedAuthError\(error\)\)\s*\{?\s*redirect\(/.test(
      pageSource(route)
    )
  );
}

// ---------------------------------------------------------------------------
console.log("\n== H. Trusted Identity & Presentation-Only Hiding ==");
// ---------------------------------------------------------------------------
const adminShellProps = braceBlockAfter(shell, "export interface AdminShellProps");
assert(
  "shell props carry server-derived presentation data, not a role union",
  // `groups`, `roleLabel` and `permissions` all come from the trusted actor
  // context in the layout; the shell only reads them to shape navigation and
  // the assistant chips. A `role: RoleName` prop would let a caller pass an
  // authority claim, so that stays forbidden.
  adminShellProps.length > 0 &&
    /\bgroups\s*:/.test(adminShellProps) &&
    /\broleLabel\s*:/.test(adminShellProps) &&
    /\bpermissions\s*:\s*PermissionKey\[\]/.test(adminShellProps) &&
    !/\brole\s*:\s*(RoleName|string)/.test(adminShellProps)
);
assert(
  "admin layout never reads the role from the URL",
  !/searchParams/.test(layout) && !/useSearchParams/.test(layout)
);
assert(
  "admin layout never reads identity from cookies or headers directly",
  !/\bcookies\(\)/.test(layout) && !/\bheaders\(\)/.test(layout)
);
assert(
  "shell performs no authorization work",
  !importSources(shell).some(
    (source) =>
      source.includes("@/lib/authz") ||
      source.startsWith("@/lib/supabase") ||
      source.includes("supabase/")
  ) &&
    !/has_permission\(/.test(shell) &&
    !/requirePermission\(|requireAnyPermission\(/.test(shell)
);
assert(
  "sidebar navigation performs no data fetching or authorization",
  !importSources(sidebar).some(
    (source) => source.includes("supabase") || source.includes("@/lib/authz")
  )
);
assert(
  "authorization runs before the shell is rendered",
  layout.indexOf("requireAnyPermission(MANAGEMENT_PERMISSIONS)") !== -1 &&
    layout.indexOf("requireAnyPermission(MANAGEMENT_PERMISSIONS)") <
      layout.indexOf("<AdminShell")
);
const adminFiles = [
  "app/admin/page.tsx",
  ...listRoutes.filter((route) => route !== "/admin").map((route) => `app${route}/page.tsx`),
  shellPath,
  sidebarPath,
];
assert(
  "no admin surface imports or advertises Stripe payment handling",
  adminFiles.every((file) => {
    const source = read(file);
    return (
      !importSources(source).some((entry) => entry.includes("stripe")) &&
      !/\bStripe\b/.test(source)
    );
  })
);

// ---------------------------------------------------------------------------
console.log("\n== I. Shared Admin Component Inventory & Integration ==");
// ---------------------------------------------------------------------------
const sharedComponents = [
  "admin-shell",
  "admin-sidebar-nav",
  "admin-brand-logo",
  "admin-page-header",
  "admin-breadcrumb",
  "admin-kpi-card",
  "admin-kpi-value",
  "admin-bar-chart",
  "admin-table-frame",
  "admin-pagination",
  "admin-status-badge",
  "admin-state-panel",
  "order-filter-bar",
  "customer-table",
  "product-table",
  "inventory-table",
  "audit-table",
];
for (const component of sharedComponents) {
  assert(
    `shared component ${component}.tsx exists`,
    exists(`components/admin/${component}.tsx`)
  );
}

const barrel = read("components/admin/index.ts");
const barrelExports = [
  "AdminShell",
  "AdminSidebarNav",
  "AdminPageHeader",
  "AdminBreadcrumb",
  "AdminKpiCard",
  "AdminKpiValue",
  "AdminBarChart",
  "AdminTableFrame",
  "AdminPagination",
  "AdminStatusBadge",
  "AdminStatePanel",
  "OrderFilterBar",
  "CustomerTable",
  "ProductTable",
  "InventoryTable",
  "AuditTable",
];
for (const name of barrelExports) {
  assert(
    `barrel exports ${name}`,
    new RegExp(`export\\s*\\{[^}]*\\b${name}\\b`).test(barrel) ||
      new RegExp(`export\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from`).test(barrel)
  );
}

const adminPageFiles = discoveredAdminPages.map(
  (route) => `app${route}/page.tsx`
);
assert(
  "pages import admin components through the barrel, not deep paths",
  adminPageFiles.every((file) => !read(file).includes('from "@/components/admin/')),
  adminPageFiles
    .filter((file) => read(file).includes('from "@/components/admin/'))
    .join(", ")
);

const dashboard = pageSource("/admin");
assert(
  "dashboard renders the shared page header",
  dashboard.includes("<AdminPageHeader")
);
assert(
  "dashboard renders KPI cards",
  (dashboard.match(/<AdminKpiCard/g) ?? []).length >= 5,
  `found ${(dashboard.match(/<AdminKpiCard/g) ?? []).length}`
);
assert(
  "dashboard renders server-side horizontal bar charts",
  (dashboard.match(/<AdminBarChart/g) ?? []).length >= 3,
  `found ${(dashboard.match(/<AdminBarChart/g) ?? []).length}`
);
assert(
  "dashboard renders state panels for empty/error paths",
  dashboard.includes("<AdminStatePanel")
);

const listIntegrations = [
  {
    route: "/admin/orders",
    required: [
      "<AdminBreadcrumb",
      "<AdminPageHeader",
      "<OrderFilterBar",
      "<AdminTableFrame",
      "<AdminPagination",
      "<AdminStatePanel",
    ],
  },
  {
    route: "/admin/customers",
    required: [
      "<AdminBreadcrumb",
      "<AdminPageHeader",
      "<CustomerTable",
      "<AdminStatePanel",
    ],
  },
  {
    route: "/admin/products",
    required: ["<AdminBreadcrumb", "<AdminPageHeader", "<ProductTable", "<AdminStatePanel"],
  },
  {
    route: "/admin/inventory",
    required: [
      "<AdminBreadcrumb",
      "<AdminPageHeader",
      "<InventoryTable",
      "<AdminStatePanel",
    ],
  },
  {
    route: "/admin/audit",
    required: ["<AdminBreadcrumb", "<AdminPageHeader", "<AuditTable", "<AdminStatePanel"],
  },
];

for (const { route, required } of listIntegrations) {
  const source = pageSource(route);
  assert(
    `${route} integrates its shared components`,
    required.every((marker) => source.includes(marker)),
    required.filter((marker) => !source.includes(marker)).join(", ")
  );
}

assert(
  "list tables share the table frame",
  ["customer-table", "product-table", "inventory-table", "audit-table"].every(
    (table) => read(`components/admin/${table}.tsx`).includes("./admin-table-frame")
  )
);
assert(
  "detail pages render the shared breadcrumb and state panel",
  ["/admin/orders/[id]", "/admin/customers/[id]", "/admin/products/[id]"].every(
    (route) =>
      pageSource(route).includes("<AdminBreadcrumb") &&
      pageSource(route).includes("<AdminStatePanel")
  )
);
assert(
  "product create route renders the shared breadcrumb and header",
  pageSource("/admin/products/new").includes("<AdminBreadcrumb") &&
    pageSource("/admin/products/new").includes("<AdminPageHeader")
);

// ---------------------------------------------------------------------------
console.log("\n== J. Bilingual Labels & Route-Driven Filtering/Pagination ==");
// ---------------------------------------------------------------------------
assert(
  "every management page derives its locale from next-intl",
  adminPageFiles.every((file) => {
    const source = read(file);
    return source.includes("getLocale") && source.includes('locale === "vi"');
  })
);
assert(
  "every management page carries bilingual copy",
  adminPageFiles.every((file) => (read(file).match(/isVi \?/g) ?? []).length >= 3),
  adminPageFiles
    .filter((file) => (read(file).match(/isVi \?/g) ?? []).length < 3)
    .join(", ")
);
assert(
  "role labels are bilingual for every role",
  ["admin", "manager", "staff", "customer"].every((role) =>
    new RegExp(`\\b${role}:\\s*\\{[^}]*en:[^}]*vi:`).test(layout)
  )
);
assert(
  "navigation labels are bilingual for every group",
  /label:\s*"[^"]+"/.test(nav) &&
    /labelVi:\s*"[^"]+"/.test(nav) &&
    navItems.every((item) => item.labelVi.length > 0)
);

const ordersPage = pageSource("/admin/orders");
assert(
  "orders page reads its filters from the URL",
  /await searchParams/.test(ordersPage) &&
    /params\.search/.test(ordersPage) &&
    /normalizeOrderStatusFilter\(params\.status\)/.test(ordersPage)
);
assert(
  "orders page passes the URL-driven page/limit into the query",
  /getAdminOrderList\(\{[\s\S]{0,200}page:\s*params\.page[\s\S]{0,120}limit:\s*params\.limit/.test(
    ordersPage
  )
);

const pagination = read("components/admin/admin-pagination.tsx");
assert(
  "pagination rewrites the current query string instead of dropping it",
  pagination.includes("new URLSearchParams(searchParams.toString())") &&
    pagination.includes("router.push(")
);
assert(
  "pagination navigates within the current pathname",
  /const pathname = usePathname\(\)/.test(pagination) &&
    /router\.push\(query \? `\$\{pathname\}\?\$\{query\}` : pathname\)/.test(pagination)
);

const filterBar = read("components/admin/order-filter-bar.tsx");
const urlSearchHook = read("hooks/use-url-search.ts");
assert(
  "changing a filter resets pagination to the first page",
  // The reset moved into the shared URL-search hook when the admin search
  // providers were introduced; every filter writer goes through updateParams.
  /if \(updateOptions\?\.resetPage !== false\) params\.delete\("page"\)/.test(
    urlSearchHook
  ) &&
    /useAdminSearch\(\)/.test(filterBar) &&
    /updateParams\(\{ status:/.test(filterBar)
);
assert(
  "shared pagination is reused by every paginated surface",
  ["audit-table", "customer-table"].every((table) =>
    read(`components/admin/${table}.tsx`).includes("AdminPagination")
  ) && ordersPage.includes("<AdminPagination")
);
assert(
  "customer and audit tables receive server-computed paging state",
  ["/admin/customers", "/admin/audit"].every((route) => {
    const source = pageSource(route);
    return (
      /page=\{queryResult\.page\}/.test(source) &&
      /limit=\{queryResult\.limit\}/.test(source) &&
      /hasMore=\{queryResult\.hasMore\}/.test(source) &&
      /initialFilters=/.test(source)
    );
  })
);

// ---------------------------------------------------------------------------
console.log("\n== K. Motion, Reduced Motion, Focus Scoping & Sidebar Accent ==");
// ---------------------------------------------------------------------------
const pageEnterKeyframes = braceBlockAfter(globals, "@keyframes admin-page-enter");
const barFillKeyframes = braceBlockAfter(globals, "@keyframes admin-bar-fill");
const pageEnterRule = braceBlockAfter(globals, ".admin-page-enter {");
const barFillRule = braceBlockAfter(globals, ".admin-bar-fill {");

assert("route-entrance keyframes exist", pageEnterKeyframes.length > 0);
assert(
  "route-entrance keyframes declare only a `from` state (safe end state)",
  /\bfrom\s*\{/.test(pageEnterKeyframes) &&
    !/\bto\s*\{/.test(pageEnterKeyframes) &&
    !/100%/.test(pageEnterKeyframes),
  pageEnterKeyframes.replace(/\s+/g, " ")
);
assert(
  "route-entrance keyframes fade and lift the content",
  /opacity:\s*0/.test(pageEnterKeyframes) &&
    /translate3d\(/.test(pageEnterKeyframes)
);
assert(
  "route-entrance class applies the animation",
  /animation:\s*admin-page-enter/.test(pageEnterRule)
);
assert("chart bar-fill keyframes exist", barFillKeyframes.length > 0);
assert(
  "chart bar keyframes scale from zero only (length stays server-computed)",
  /scaleX\(0\)/.test(barFillKeyframes) &&
    !/\bto\s*\{/.test(barFillKeyframes) &&
    !/100%/.test(barFillKeyframes)
);
assert(
  "chart bar reveal is anchored to the left edge",
  /transform-origin:\s*left center/.test(barFillRule) &&
    /animation:\s*admin-bar-fill/.test(barFillRule)
);

const reducedMotionRule = reducedMotionBlockFor(globals, ".admin-bar-fill");
assert(
  "reduced motion disables both admin animations outright",
  /\.admin-page-enter/.test(reducedMotionRule) &&
    /\.admin-bar-fill/.test(reducedMotionRule) &&
    /animation:\s*none/.test(reducedMotionRule),
  reducedMotionRule.replace(/\s+/g, " ")
);
assert(
  "a global reduced-motion block still neutralises durations for the rest of the UI",
  cssBlocksAfter(globals, "@media (prefers-reduced-motion: reduce)").some((block) =>
    /animation-duration/.test(block) && /transition-duration/.test(block)
  )
);

const barChart = read("components/admin/admin-bar-chart.tsx");
assert(
  "bar chart is dependency-free (no charting library import)",
  !importSources(barChart).some((source) =>
    /recharts|chart\.js|chartjs|d3|echarts|apexcharts|victory|nivo/i.test(source)
  ),
  importSources(barChart).join(", ")
);
assert(
  "bar chart staggers the CSS reveal per bar",
  /animationDelay:/.test(barChart) && barChart.includes("admin-bar-fill")
);
assert(
  "bar chart exposes every value as text, not colour alone",
  /<figcaption className="sr-only">/.test(barChart) &&
    /<ul/.test(barChart) &&
    /aria-hidden="true"/.test(barChart)
);

const pkg = JSON.parse(read("package.json"));
const chartingDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  (dependency) => /recharts|chart\.js|chartjs|d3|echarts|apexcharts|victory|nivo/i.test(dependency)
);
assert(
  "no charting library is installed",
  chartingDeps.length === 0,
  chartingDeps.join(", ")
);

const kpiValue = read("components/admin/admin-kpi-value.tsx");
assert(
  "KPI count-up starts from the server-rendered final value",
  /useState\(value\)/.test(kpiValue),
  "server render must not start at zero"
);
assert(
  "KPI count-up exposes the final value to assistive technology",
  /<span className="sr-only">\{format\(value\)\}<\/span>/.test(kpiValue)
);
assert(
  "KPI intermediate frames are hidden from the accessibility tree",
  /aria-hidden="true"/.test(kpiValue)
);
assert(
  "KPI count-up honours prefers-reduced-motion",
  /prefers-reduced-motion: reduce/.test(kpiValue) &&
    /IntersectionObserver/.test(kpiValue)
);
assert(
  "KPI count-up cancels its animation frame on teardown",
  /cancelAnimationFrame\(frameRef\.current\)/.test(kpiValue)
);

// The two storefront overlay widgets deliberately suppress the global outline
// because their wrapper draws its own ring; everything else must stay inside
// the admin scope.
const STOREFRONT_FOCUS_SCOPES = [
  ".assistant-composer",
  ".search-command-palette",
];
function isAllowedFocusScope(selector) {
  return (
    selector.startsWith(".admin-scope") ||
    selector === "*" ||
    STOREFRONT_FOCUS_SCOPES.some((scope) => selector.startsWith(scope))
  );
}

const cssNoComments = globals.replace(/\/\*[\s\S]*?\*\//g, "");
const focusSelectors = [];
for (let index = cssNoComments.indexOf(":focus-visible"); index !== -1; ) {
  focusSelectors.push(cssSelectorAt(cssNoComments, index));
  index = cssNoComments.indexOf(":focus-visible", index + 1);
}
assert(
  "focus rules are either the global storefront rule, a storefront overlay scope or .admin-scope scoped",
  focusSelectors.length > 0 && focusSelectors.every(isAllowedFocusScope),
  focusSelectors.filter((selector) => !isAllowedFocusScope(selector)).join(" | ")
);
const storefrontFocus = braceBlockAfter(globals, "*:focus-visible {");
assert(
  "the global storefront focus indicator is still defined",
  /outline:\s*2px solid var\(--ring\)/.test(storefrontFocus),
  storefrontFocus.replace(/\s+/g, " ")
);
const outlineNoneSelectors = [];
for (let index = cssNoComments.indexOf("outline: none"); index !== -1; ) {
  outlineNoneSelectors.push(cssSelectorAt(cssNoComments, index));
  index = cssNoComments.indexOf("outline: none", index + 1);
}
assert(
  "outline suppression only ever happens inside .admin-scope or a storefront overlay scope",
  outlineNoneSelectors.length > 0 && outlineNoneSelectors.every(isAllowedFocusScope),
  outlineNoneSelectors.filter((selector) => !isAllowedFocusScope(selector)).join(" | ")
);

assert(
  "active sidebar item renders no vertical accent line",
  !/(border-l|border-s-|before:|after:|w-px|w-\[2px\]|w-\[3px\])/.test(sidebar),
  "the active state should be a tint, not a rail marker"
);
assert(
  "active sidebar item is expressed as a warm tint",
  /bg-amber\/15/.test(sidebar) && /aria-current=\{isActive \? "page" : undefined\}/.test(sidebar)
);

// ---------------------------------------------------------------------------
console.log("\n== L. Request-Scoped Session / Authorization Invariants ==");
// ---------------------------------------------------------------------------
const sessionPath = "lib/supabase/session.ts";
const authzPath = "lib/authz.ts";
const identityPath = "lib/admin-identity.ts";

for (const required of [sessionPath, authzPath, identityPath]) {
  assert(`${required} exists`, exists(required), required);
}

const session = read(sessionPath);
const authz = read(authzPath);
const identity = read(identityPath);

assert(
  "session helper exports a cached request-scoped client",
  /export const getSessionClient = cache\(/.test(session)
);
assert(
  "session helper exports a cached verified user",
  /export const getVerifiedUser = cache\(/.test(session)
);
assert(
  "verified user still comes from auth.getUser()",
  /supabase\.auth\.getUser\(\)/.test(session)
);
assert(
  "verified user falls back to null instead of throwing",
  /user \?\? null/.test(session)
);
assert(
  "authorization consumes the shared session helpers",
  /from\s*"@\/lib\/supabase\/session"/.test(authz) &&
    /\bgetSessionClient\b/.test(authz) &&
    /\bgetVerifiedUser\b/.test(authz)
);
assert(
  "authorization does not verify the token a second time itself",
  verifiedUserCallCount(authz) === 0
);
const resolveActorBlock = braceBlockAfter(authz, "async function resolveActorContext");
assert(
  "actor lookup is dispatched before the session check is awaited",
  resolveActorBlock.includes('.rpc("current_actor")') &&
    resolveActorBlock.indexOf('.rpc("current_actor")') <
      resolveActorBlock.indexOf("await getVerifiedUser()"),
  "expected the concurrent current_actor() dispatch inside resolveActorContext"
);
assert(
  "actor lookup keeps the sequential fallback for failed/blank results",
  /if\s*\(error \|\| !data\)\s*\{[\s\S]{0,200}await\s+supabase\.rpc\("current_actor"\)/.test(
    authz
  )
);
assert(
  "actor context is memoized per request",
  /export const getActorContext[\s\S]{0,120}cache\(resolveActorContext\)/.test(authz)
);
assert(
  "admin identity reuses the verified user instead of re-authenticating",
  /from\s*"@\/lib\/supabase\/session"/.test(identity) &&
    /\bgetVerifiedUser\(\)/.test(identity) &&
    verifiedUserCallCount(identity) === 0
);
assert(
  "only the session helper verifies the session on the render path",
  verifiedUserCallCount(authz) === 0 &&
    verifiedUserCallCount(identity) === 0 &&
    verifiedUserCallCount(session) === 1
);

// ---------------------------------------------------------------------------
console.log(`\n${"=".repeat(60)}`);
console.log(`RESULT: ${passed} passed, ${failed} failed`);
console.log("=".repeat(60));
console.log(
  "Limit: static source inspection only. Rendered layout, focus order,",
  "computed CSS, hydration and authenticated routing still need a browser",
  "session against /admin."
);
process.exit(failed > 0 ? 1 : 0);
