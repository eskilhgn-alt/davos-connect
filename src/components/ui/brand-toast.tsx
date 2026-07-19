import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

const brandToastVariants = cva(
  "pointer-events-auto flex w-full items-center gap-3 rounded-card p-4 shadow-lg transition-all animate-slide-up",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground border border-border",
        success: "bg-card text-foreground border-l-4 border-l-success",
        error: "bg-card text-foreground border-l-4 border-l-destructive",
        info: "bg-card text-foreground border-l-4 border-l-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BrandToastProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof brandToastVariants> {
  title: string;
  description?: string;
  onClose?: () => void;
}

const BrandToast = React.forwardRef<HTMLDivElement, BrandToastProps>(
  ({ className, variant, title, description, onClose, ...props }, ref) => {
    const IconMap = {
      default: null,
      success: CheckCircle,
      error: AlertCircle,
      info: Info,
    };

    const Icon = variant ? IconMap[variant] : null;
    const iconColorMap = {
      default: "",
      success: "text-success",
      error: "text-destructive",
      info: "text-primary",
    };

    return (
      <div
        ref={ref}
        className={cn(brandToastVariants({ variant, className }))}
        role="alert"
        {...props}
      >
        {Icon && (
          <Icon
            size={20}
            strokeWidth={2}
            className={cn("shrink-0", variant && iconColorMap[variant])}
          />
        )}
        <div className="flex-1">
          <p className="font-heading text-sm font-semibold">{title}</p>
          {description && (
            <p className="font-body text-sm text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors tap-target"
            aria-label="Lukk"
          >
            <X size={18} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  }
);
BrandToast.displayName = "BrandToast";

export { BrandToast, brandToastVariants };
