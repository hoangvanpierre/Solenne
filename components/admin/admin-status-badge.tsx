import { cn } from "@/lib/utils";

// Single status pill for the management area.
//
// Tones are the only colour authority: callers pick meaning (positive,
// attention, danger, …) and never a raw class string, so the same state reads
// the same on every screen and dark mode stays consistent. Champagne and sage
// stay tints behind dark text — never a text colour on its own for small copy.
export type AdminStatusTone =
  | "neutral"
  | "positive"
  | "attention"
  | "danger"
  | "info"
  | "accent";

const TONE_STYLES: Record<AdminStatusTone, string> = {
  neutral: "border-border bg-muted/60 text-muted-foreground",
  positive: "border-sage/40 bg-sage/15 text-foreground",
  attention: "border-amber/40 bg-amber/15 text-foreground",
  danger: "border-destructive/40 bg-destructive/15 text-destructive",
  info: "border-primary/30 bg-primary/10 text-foreground",
  accent: "border-blush/40 bg-blush/15 text-foreground",
};

const DOT_STYLES: Record<AdminStatusTone, string> = {
  neutral: "bg-muted-foreground",
  positive: "bg-sage",
  attention: "bg-amber",
  danger: "bg-destructive",
  info: "bg-primary",
  accent: "bg-blush",
};

export interface AdminStatusBadgeProps {
  /** Already-localized status text. */
  label: React.ReactNode;
  tone?: AdminStatusTone;
  /** Leading tone dot, for states that need a non-textual cue. */
  dot?: boolean;
  /** Uppercase wide-tracking treatment used by compact status pills. */
  uppercase?: boolean;
  className?: string;
}

export function AdminStatusBadge({
  label,
  tone = "neutral",
  dot = false,
  uppercase = false,
  className,
}: AdminStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-normal",
        uppercase && "uppercase tracking-wider",
        TONE_STYLES[tone],
        className
      )}
    >
      {dot ? (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", DOT_STYLES[tone])}
          aria-hidden="true"
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
