import * as React from "react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  leftAction,
  rightAction,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-primary text-primary-foreground safe-area-top">
      <div className="flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-3 min-w-12">
          {leftAction}
        </div>
        <div className="flex-1 text-center">
          <h1 className="font-heading text-lg font-semibold truncate">{title}</h1>
          {subtitle && (
            <p className="font-body text-xs text-primary-foreground/70 truncate">
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
