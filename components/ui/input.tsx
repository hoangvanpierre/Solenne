"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", error, label, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const errorId = `${inputId || generatedId}-error`;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-normal text-foreground"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={cn(
            "solenne-field flex h-(--field-height) w-full px-(--field-padding-inline) py-2 text-[13.5px]",

            "disabled:cursor-not-allowed disabled:opacity-50",
            "[&::-ms-reveal]:hidden [&::-ms-clear]:hidden",
            className
          )}
          {...props}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={
            [props["aria-describedby"], error ? errorId : undefined]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        {error && (
          <p id={errorId} className="text-xs text-destructive">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
