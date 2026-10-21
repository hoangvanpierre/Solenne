import { ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Presentational shell for the "can't render this" states the management pages
// already handle (403 / restricted / load failure / not found).
//
// It never performs an authorization check of its own: callers only render it
// AFTER lib/authz.ts has thrown. Copy is passed in so each page keeps its own
// bilingual wording and no permission names or database errors leak out.

export type AdminStatePanelTone = "neutral" | "danger";

export interface AdminStatePanelProps {
  title: string;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: AdminStatePanelTone;
  actions?: React.ReactNode;
  className?: string;
}

const TONE_STYLES: Record<AdminStatePanelTone, string> = {
  neutral: "bg-amber/10 text-amber-dark",
  danger: "bg-destructive/10 text-destructive",
};

export function AdminStatePanel({
  title,
  description,
  icon: Icon = ShieldAlert,
  tone = "neutral",
  actions,
  className,
}: AdminStatePanelProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border p-10 text-center",
        className
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "mx-auto flex h-12 w-12 items-center justify-center rounded-full",
          TONE_STYLES[tone]
        )}
      >
        <Icon className="h-6 w-6" />
      </div>

      <h2 className="mt-5 text-2xl text-foreground">{title}</h2>

      {description ? (
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {actions ? (
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
