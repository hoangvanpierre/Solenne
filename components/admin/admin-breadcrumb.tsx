import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// The single "back up the tree" affordance used by every management screen.
//
// Detail pages point it at their parent list, top-level modules at /admin, so
// the same control always means "one level up" instead of each page inventing
// its own arrow link.
export interface AdminBreadcrumbProps {
  /** Where "up" is. Defaults to the admin hub. */
  href?: string;
  /** Localized destination name. */
  label: string;
  className?: string;
}

export function AdminBreadcrumb({
  href = "/admin",
  label,
  className,
}: AdminBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <Link
        href={href}
        className={cn(
          "admin-quiet-link inline-flex items-center gap-1.5 rounded text-xs font-medium uppercase tracking-[0.08em] transition-colors"
        )}
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{label}</span>
      </Link>
    </nav>
  );
}
