import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { DavosButton } from "./davos-button";

export interface DavosEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const DavosEmptyState = React.forwardRef<HTMLDivElement, DavosEmptyStateProps>(
  ({ className, icon: Icon, title, description, actionLabel, onAction, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center px-6 py-12 text-center animate-fade-in",
          className
        )}
        {...props}
      >
        {Icon && (
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Icon size={32} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
        )}
        <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
          {title}
        </h3>
        {description && (
          <p className="font-body text-base text-muted-foreground max-w-xs mb-6">
            {description}
          </p>
        )}
        {actionLabel && onAction && (
          <DavosButton variant="primary" onClick={onAction}>
            {actionLabel}
          </DavosButton>
        )}
      </div>
    );
  }
);
DavosEmptyState.displayName = "DavosEmptyState";

export { DavosEmptyState };
