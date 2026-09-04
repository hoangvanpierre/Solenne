"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  badge?: number;
  size?: "sm" | "default" | "lg";
}

const sizeStyles: Record<string, string> = {
  sm: "h-8 w-8",
  default: "h-10 w-10",
  lg: "h-12 w-12",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, badge, size = "default", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full",
          "text-foreground transition-all duration-200",
          "hover:bg-muted active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:pointer-events-none disabled:opacity-50",
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {children}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
