import * as React from "react";
import { cn } from "@/lib/utils";

export interface DavosSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "circular" | "rectangular" | "card";
}

const DavosSkeleton = React.forwardRef<HTMLDivElement, DavosSkeletonProps>(
  ({ className, variant = "rectangular", ...props }, ref) => {
    const variantClasses = {
      text: "h-4 w-full rounded",
      circular: "rounded-full aspect-square",
      rectangular: "rounded-lg",
      card: "rounded-card h-32",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "bg-muted animate-skeleton-pulse",
          variantClasses[variant],
          className
        )}
        {...props}
      />
    );
  }
);
DavosSkeleton.displayName = "DavosSkeleton";

// Pre-built skeleton patterns for common use cases
const DavosListRowSkeleton = () => (
  <div className="flex items-center gap-4 px-4 py-3">
    <DavosSkeleton variant="circular" className="h-10 w-10 shrink-0" />
    <div className="flex-1 space-y-2">
      <DavosSkeleton variant="text" className="w-3/4" />
      <DavosSkeleton variant="text" className="w-1/2 h-3" />
    </div>
  </div>
);

const DavosCardSkeleton = () => (
  <div className="p-4 space-y-3">
    <DavosSkeleton variant="text" className="w-1/3 h-5" />
    <DavosSkeleton variant="rectangular" className="h-24" />
    <DavosSkeleton variant="text" className="w-full" />
    <DavosSkeleton variant="text" className="w-2/3" />
  </div>
);

export { DavosSkeleton, DavosListRowSkeleton, DavosCardSkeleton };
