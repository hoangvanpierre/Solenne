import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Presentational only (no hooks, no "use client"), so the same component can be
// rendered by a Server Component and inside the interactive review section.
// The accessible label is always supplied by the caller, which is what keeps
// the control localized.

export interface StarRatingProps {
  /** Average or individual rating, 1–5. Null renders five empty stars. */
  value: number | null;
  /** Localized label, e.g. "Average rating 4.5 out of 5". */
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const STAR_SIZE = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

export function StarRating({
  value,
  label,
  size = "md",
  className,
}: StarRatingProps) {
  const rounded = value === null ? 0 : Math.round(value);

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 text-primary", className)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          aria-hidden="true"
          className={cn(
            STAR_SIZE[size],
            star <= rounded ? "fill-current" : "opacity-25"
          )}
        />
      ))}
    </span>
  );
}
