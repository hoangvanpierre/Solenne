"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

// Native radio inputs keep the keyboard contract free: arrow keys move between
// stars, Space selects, and the group is announced as a radiogroup. The visible
// stars are decorative; each input carries the localized star label.

export interface StarRatingInputProps {
  value: number;
  onChange: (value: number) => void;
  /** Group label, e.g. "Your rating". */
  label: string;
  /** Localized label for one star, e.g. "4 out of 5 stars". */
  starLabel: (star: number) => string;
  name?: string;
  disabled?: boolean;
  error?: string;
}

export function StarRatingInput({
  value,
  onChange,
  label,
  starLabel,
  name = "rating",
  disabled = false,
  error,
}: StarRatingInputProps) {
  return (
    <div>
      <div
        role="radiogroup"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        className="flex items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            className={cn(
              "cursor-pointer rounded-md p-0.5",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              disabled={disabled}
              aria-label={starLabel(star)}
              className="peer sr-only"
            />
            <Star
              aria-hidden="true"
              className={cn(
                "h-7 w-7 rounded-md transition-colors duration-150",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                star <= value
                  ? "fill-current text-primary"
                  : "text-muted-foreground/40 hover:text-primary/70"
              )}
            />
          </label>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
