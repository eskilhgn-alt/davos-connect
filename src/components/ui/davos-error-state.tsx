import * as React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import { DavosButton } from "./davos-button";

export interface DavosErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

const DavosErrorState = React.forwardRef<HTMLDivElement, DavosErrorStateProps>(
  (
    {
      className,
      title = "Noe gikk galt",
      description = "Vi kunne ikke laste inn innholdet. Prøv igjen.",
      onRetry,
      retryLabel = "Prøv igjen",
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center px-6 py-12 text-center animate-fade-in",
          className
        )}
        {...props}
      >
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle size={32} strokeWidth={1.5} className="text-destructive" />
        </div>
        <h3 className="font-heading text-xl font-semibold text-foreground mb-2">
          {title}
        </h3>
        <p className="font-body text-base text-muted-foreground max-w-xs mb-6">
          {description}
        </p>
        {onRetry && (
          <DavosButton variant="secondary" onClick={onRetry}>
            {retryLabel}
          </DavosButton>
        )}
      </div>
    );
  }
);
DavosErrorState.displayName = "DavosErrorState";

export { DavosErrorState };
