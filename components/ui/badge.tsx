import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "outline" | "sale" | "new";
}

const variantStyles: Record<string, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-secondary/10 text-secondary-foreground border-secondary/20",
  outline: "bg-transparent text-foreground border-border",
  sale: "bg-destructive/10 text-destructive border-destructive/20",
  new: "bg-amber/10 text-amber-dark border-amber/20",
};

export function Badge({
  className,
  variant = "default",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
