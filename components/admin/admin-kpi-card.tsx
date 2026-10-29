import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminKpiValue } from "./admin-kpi-value";

// Presentational only — no data fetching here. Every number is resolved on the
// server by lib/admin-metrics.ts and handed in already permission-checked.
// The card itself stays a Server Component; only the numeral is a tiny client
// component that performs the one-off count-up.

export type AdminKpiTone = "neutral" | "attention" | "danger";

export interface AdminKpiCardProps {
  label: string;
  value: number;
  hint?: string;
  href?: string;
  icon: LucideIcon;
  tone?: AdminKpiTone;
  locale?: string;
}

// Icon chips only carry a tint: the accent colours in this theme fail WCAG AA
// as small text (amber ~2.5:1 on ivory), so text stays foreground and the
// colour lives in the chip background / icon.
const TONE_STYLES: Record<AdminKpiTone, string> = {
  neutral: "bg-muted text-foreground/80",
  attention: "bg-amber/15 text-amber",
  danger: "bg-destructive/10 text-destructive",
};

const CARD_BASE =
  "flex flex-col rounded-2xl border border-border bg-card p-5 transition-colors sm:p-6";
const CARD_INTERACTIVE =
  "hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function AdminKpiCard({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone = "neutral",
  locale = "en",
}: AdminKpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <span
          aria-hidden="true"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            TONE_STYLES[tone]
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <p className="mt-3 text-4xl font-medium leading-[1.1] tabular-nums text-foreground">
        <AdminKpiValue value={value} locale={locale} />
      </p>

      {hint ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(CARD_BASE, CARD_INTERACTIVE)}>
        {body}
      </Link>
    );
  }

  return <div className={CARD_BASE}>{body}</div>;
}
