import * as React from "react";
import { cn } from "@/lib/utils";

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  className?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  leftAction,
  rightAction,
  className,
}) => {
  return (
    <header className={cn("sticky top-0 z-40 bg-background safe-area-top border-b border-border", className)}>
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3 min-w-12">
          {leftAction}
        </div>
        <div className="flex-1 text-center">
          <h1 className="font-heading text-base font-semibold text-foreground tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="font-body text-[11px] text-muted-foreground truncate">
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 min-w-12 justify-end">
          {rightAction}
        </div>
      </div>
    </header>
  );
};
