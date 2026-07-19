import * as React from "react";
import { cn } from "@/lib/utils";

const BrandCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "bg-card text-card-foreground rounded-card shadow-card transition-shadow duration-200 hover:shadow-card-hover",
      className
    )}
    {...props}
  />
));
BrandCard.displayName = "BrandCard";

const BrandCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4", className)}
    {...props}
  />
));
BrandCardHeader.displayName = "BrandCardHeader";

const BrandCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-heading text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
BrandCardTitle.displayName = "BrandCardTitle";

const BrandCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
BrandCardContent.displayName = "BrandCardContent";

export { BrandCard, BrandCardHeader, BrandCardTitle, BrandCardContent };
