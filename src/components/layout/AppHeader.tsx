import * as React from "react";
import { cn } from "@/lib/utils";
import { BackButton, HomeArrowButton } from "./BackButton";

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Hard navigation for the global error screen, where the router is unavailable. */
  onHome?: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  onHome,
  rightAction,
  className,
}) => {
  return (
    <header className={cn("sticky top-0 z-40 shrink-0 bg-background safe-area-top border-b border-border", className)}>
      <div className="flex items-center justify-between gap-3 h-14 px-4">
        <div className="flex items-center gap-3 min-w-12">
          {onHome ? <HomeArrowButton onClick={onHome} /> : <BackButton />}
        </div>
        <div className="flex-1 min-w-0 text-center">
          <h1 className="font-heading text-base font-semibold text-foreground tracking-tight truncate">{title}<sup className="ml-0.5 text-[9px] font-body font-normal text-muted-foreground align-super">Beta</sup></h1>
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
