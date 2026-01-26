import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const davosButtonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-heading font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 tap-target",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-foreground hover:brightness-105 active:brightness-95 shadow-sm",
        secondary:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        ghost:
          "text-foreground hover:bg-muted active:bg-muted/80",
        outline:
          "border-2 border-primary text-primary bg-transparent hover:bg-primary hover:text-primary-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-9 px-4 text-sm rounded-lg",
        md: "h-11 px-6 text-base rounded-lg",
        lg: "h-14 px-8 text-lg rounded-xl",
        icon: "h-11 w-11 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface DavosButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof davosButtonVariants> {
  asChild?: boolean;
}

const DavosButton = React.forwardRef<HTMLButtonElement, DavosButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(davosButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
DavosButton.displayName = "DavosButton";

export { DavosButton, davosButtonVariants };
