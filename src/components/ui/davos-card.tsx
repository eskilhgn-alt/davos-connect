import * as React from "react";
import { cn } from "@/lib/utils";

const DavosCard = React.forwardRef<
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
DavosCard.displayName = "DavosCard";

const DavosCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-4", className)}
    {...props}
  />
));
DavosCardHeader.displayName = "DavosCardHeader";

const DavosCardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-heading text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DavosCardTitle.displayName = "DavosCardTitle";

const DavosCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-4 pt-0", className)} {...props} />
));
DavosCardContent.displayName = "DavosCardContent";

export { DavosCard, DavosCardHeader, DavosCardTitle, DavosCardContent };
