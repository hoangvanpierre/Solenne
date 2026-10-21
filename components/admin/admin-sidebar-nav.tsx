"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  LayoutDashboard,
  Layers,
  Package,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  findAdminNavItem,
  type AdminNavGroup,
  type AdminNavItemId,
} from "@/lib/admin-nav";
import { cn } from "@/lib/utils";

// Icons are resolved here rather than in lib/admin-nav.ts so the navigation
// model stays plain serializable data when the server layout passes it down.

const NAV_ICONS: Record<AdminNavItemId, LucideIcon> = {
  overview: LayoutDashboard,
  orders: Package,
  products: Layers,
  inventory: Boxes,
  customers: Users,
  audit: ShieldCheck,
};

export interface AdminSidebarNavProps {
  /** Already filtered to the actor's permissions by the server layout. */
  groups: AdminNavGroup[];
  locale: string;
  /** Lets the mobile drawer close itself when a destination is chosen. */
  onNavigate?: () => void;
}

export function AdminSidebarNav({
  groups,
  locale,
  onNavigate,
}: AdminSidebarNavProps) {
  const isVi = locale === "vi";
  const pathname = usePathname();
  const activeItem = findAdminNavItem(pathname);

  return (
    <nav aria-label={isVi ? "Điều hướng quản trị" : "Management navigation"}>
      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.id}>
            <h2 className="px-3 pb-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              {isVi ? group.labelVi : group.label}
            </h2>

            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = NAV_ICONS[item.id];
                const isActive = activeItem?.id === item.id;

                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-base transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                        isActive
                          ? "bg-amber/15 text-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors duration-150",
                          isActive ? "text-foreground/70" : "text-muted-foreground"
                        )}
                      />
                      <span className="truncate">
                        {isVi ? item.labelVi : item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
