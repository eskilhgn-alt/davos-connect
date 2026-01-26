import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const davosPillVariants = cva(
  "inline-flex items-center justify-center font-body text-sm font-medium transition-colors rounded-pill",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        primary: "bg-primary text-primary-foreground",
        accent: "bg-accent text-accent-foreground",
        outline: "border border-border text-foreground bg-transparent",
      },
      size: {
        sm: "h-6 px-2.5 text-xs",
        md: "h-8 px-4 text-sm",
        lg: "h-10 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface DavosPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof davosPillVariants> {}

const DavosPill = React.forwardRef<HTMLSpanElement, DavosPillProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(davosPillVariants({ variant, size, className }))}
      {...props}
    />
  )
);
DavosPill.displayName = "DavosPill";

export { DavosPill, davosPillVariants };
