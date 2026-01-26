import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronRight, LucideIcon } from "lucide-react";

export interface DavosListRowProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  showChevron?: boolean;
  trailing?: React.ReactNode;
}

const DavosListRow = React.forwardRef<HTMLButtonElement, DavosListRowProps>(
  ({ className, icon: Icon, title, subtitle, showChevron = true, trailing, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "flex w-full items-center gap-4 px-4 py-3 text-left transition-colors tap-target",
          "hover:bg-muted/50 active:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          className
        )}
        {...props}
      >
        {Icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Icon size={20} strokeWidth={2} className="text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-body text-base font-medium text-foreground truncate">
            {title}
          </p>
          {subtitle && (
            <p className="font-body text-sm text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
        {trailing}
        {showChevron && (
          <ChevronRight size={20} strokeWidth={2} className="shrink-0 text-muted-foreground" />
        )}
      </button>
    );
  }
);
DavosListRow.displayName = "DavosListRow";

export { DavosListRow };
