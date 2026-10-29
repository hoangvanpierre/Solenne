"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, LogOut, Menu, X } from "lucide-react";
import { LocaleToggle } from "@/components/layout";
import { signOutAction } from "@/app/actions/auth";
import { useLockedBody } from "@/hooks/use-locked-body";
import { findAdminNavItem, type AdminNavGroup } from "@/lib/admin-nav";
import { cn } from "@/lib/utils";
import type { PermissionKey } from "@/types";
import { AdminBrandLogo } from "./admin-brand-logo";
import { AdminSidebarNav } from "./admin-sidebar-nav";

// The assistant pulls in @ai-sdk/react and the transport, so it is split out
// of the admin shell chunk and only fetched when the operator opens it.
const AdminAssistant = dynamic(
  () => import("./assistant").then((mod) => mod.AdminAssistant),
  { ssr: false }
);

// Responsive chrome for every management route.
//
// SECURITY: this component only paints. The session, the account status and
// the permission set were already verified by app/admin/layout.tsx (a Server
// Component) before these props were computed, and `groups` arrives already
// filtered to the actor's real permissions. Nothing here reads a role from the
// client, and hiding or showing a link never authorizes anything — every route
// and server action re-checks its own permission.
//
// The layout stays a Server Component; only the interactive chrome (drawer
// state + active-link highlighting via usePathname) is client-side.

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface AdminShellProps {
  /** Permission-filtered navigation model from lib/admin-nav.ts. */
  groups: AdminNavGroup[];
  locale: string;
  /** Human-readable role from the trusted actor context. */
  roleLabel: string;
  /** The actor's real permission set — used only to shape assistant chips. */
  permissions: PermissionKey[];
  fullName: string | null;
  email: string | null;
  children: React.ReactNode;
}

export function AdminShell({
  groups,
  locale,
  roleLabel,
  permissions,
  fullName,
  email,
  children,
}: AdminShellProps) {
  const isVi = locale === "vi";
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenedRef = useRef(false);

  useLockedBody(isDrawerOpen);

  const activeItem = findAdminNavItem(pathname);
  const sectionLabel = activeItem
    ? isVi
      ? activeItem.labelVi
      : activeItem.label
    : isVi
      ? "Quản trị"
      : "Administration";

  // A navigation while the drawer is open should leave it closed. Adjusting
  // state during render (rather than in an effect) avoids a cascading render.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    if (isDrawerOpen) setIsDrawerOpen(false);
  }

  // Move focus into the drawer, keep Tab inside it, close on Escape.
  useEffect(() => {
    if (!isDrawerOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsDrawerOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen]);

  // Return focus to the trigger, but never steal focus on first mount.
  useEffect(() => {
    if (isDrawerOpen) {
      wasOpenedRef.current = true;
      return;
    }

    if (wasOpenedRef.current) {
      wasOpenedRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isDrawerOpen]);

  const identity = (
    <ShellIdentity
      isVi={isVi}
      roleLabel={roleLabel}
      fullName={fullName}
      email={email}
    />
  );

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <a
        href="#admin-main"
        className="admin-skip-link sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[80] focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:text-background"
      >
        {isVi ? "Chuyển đến nội dung" : "Skip to content"}
      </a>

      {/* Desktop rail */}
      <aside className="hidden border-r border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[268px] lg:shrink-0 lg:self-start lg:flex-col">
        <div className="px-4 pb-4 pt-5">
          <AdminBrandLogo isVi={isVi} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <AdminSidebarNav groups={groups} locale={locale} />
        </div>

        <div className="border-t border-border p-2.5">{identity}</div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isDrawerOpen ? (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <motion.button
              type="button"
              aria-label={isVi ? "Đóng menu" : "Close menu"}
              onClick={() => setIsDrawerOpen(false)}
              data-focus-plain
              className="absolute inset-0 h-full w-full cursor-default bg-black/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
            />

            <motion.div
              id="admin-mobile-nav"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label={isVi ? "Điều hướng quản trị" : "Management navigation"}
              tabIndex={-1}
              className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl outline-none"
              initial={prefersReducedMotion ? { opacity: 0 } : { x: "-100%" }}
              animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { x: "-100%" }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.24,
                ease: "easeOut",
              }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-3">
                <AdminBrandLogo isVi={isVi} />
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  aria-label={isVi ? "Đóng menu" : "Close menu"}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
                <AdminSidebarNav
                  groups={groups}
                  locale={locale}
                  onNavigate={() => setIsDrawerOpen(false)}
                />
              </div>

              <div className="border-t border-border p-2.5">{identity}</div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center gap-3 2xl:max-w-[1500px]">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              aria-label={isVi ? "Mở menu" : "Open menu"}
              aria-expanded={isDrawerOpen}
              aria-controls="admin-mobile-nav"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {isVi ? "Quản trị" : "Administration"}
              </p>
              <p className="truncate text-base text-foreground">{sectionLabel}</p>
            </div>

            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <span className="hidden items-center rounded-full border border-border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground sm:inline-flex">
                {roleLabel}
              </span>

              <AdminAssistant locale={locale} permissions={permissions} />

              <LocaleToggle />

              <Link
                href="/"
                className="admin-quiet-link inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {isVi ? "Về tiệm" : "Boutique"}
                </span>
                <span className="sr-only sm:hidden">
                  {isVi ? "Về tiệm nến" : "Return to boutique"}
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main
          id="admin-main"
          tabIndex={-1}
          className="w-full flex-1 px-4 outline-none sm:px-6 lg:px-8"
        >
          {/* The measure belongs to the content, not to the scroll container:
              keeping it inside the padding lets the dashboard use the full main
              column up to 1320px instead of maxing out at 1256px, and aligns
              the content with the top bar above it. Both wrappers widen to
              1500px from the 2xl breakpoint (1536px) and stay centred beyond
              that, so the two grids keep identical left/right edges. */}
          <div className="mx-auto w-full max-w-[1320px] 2xl:max-w-[1500px]">
            {/* Entrance transition for the changing page content only. The key
                is the pathname, so a genuine route change remounts this wrapper
                and replays the CSS animation, while query-string updates
                (search, filters, pagination) keep the same key and stay
                instant. Nothing above this div animates, so the rail, top bar
                and brand mark never move. The keyframes declare only a `from`
                state, so a skipped or disabled animation still ends at the
                natural, fully visible layout. */}
            <div key={pathname} className="admin-page-enter">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

interface ShellIdentityProps {
  isVi: boolean;
  roleLabel: string;
  fullName: string | null;
  email: string | null;
}

// Compact account area in the sidebar footer. Display only — the sign-out
// control posts to the same server action the rest of the app uses.
function ShellIdentity({
  isVi,
  roleLabel,
  fullName,
  email,
}: ShellIdentityProps) {
  const displayName =
    fullName || email || (isVi ? "Đội ngũ Solenne" : "Solenne team");
  const monogram = displayName.trim().charAt(0).toUpperCase() || "S";

  return (
    <div className="rounded-xl border border-border/70 bg-muted/40 p-3">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber/15 text-sm text-foreground"
        >
          {monogram}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {displayName}
          </p>
          {email && fullName ? (
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex min-w-0 items-center truncate rounded-full border border-border px-2 py-0.5",
            "text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground"
          )}
        >
          {roleLabel}
        </span>

        <form action={signOutAction} className="shrink-0">
          <button
            type="submit"
            className="admin-logout-button inline-flex min-h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-[0.02em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <LogOut className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">
              {isVi ? "Đăng xuất" : "Sign out"}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
