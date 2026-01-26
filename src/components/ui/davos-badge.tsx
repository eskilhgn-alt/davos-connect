import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const davosBadgeVariants = cva(
  "inline-flex items-center justify-center font-mono text-xs font-medium rounded-full",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        primary: "bg-primary text-primary-foreground",
        accent: "bg-accent text-accent-foreground",
        success: "bg-secondary text-secondary-foreground",
        warning: "bg-accent text-accent-foreground",
        critical: "bg-destructive text-destructive-foreground",
      },
      size: {
        sm: "h-5 min-w-5 px-1.5 text-[10px]",
        md: "h-6 min-w-6 px-2 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface DavosBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof davosBadgeVariants> {
  count?: number;
  maxCount?: number;
}

const DavosBadge = React.forwardRef<HTMLSpanElement, DavosBadgeProps>(
  ({ className, variant, size, count, maxCount = 99, children, ...props }, ref) => {
    const displayValue = count !== undefined
      ? count > maxCount
        ? `${maxCount}+`
        : count.toString()
      : children;

    return (
      <span
        ref={ref}
        className={cn(davosBadgeVariants({ variant, size, className }))}
        {...props}
      >
        {displayValue}
      </span>
    );
  }
);
DavosBadge.displayName = "DavosBadge";

export { DavosBadge, davosBadgeVariants };
