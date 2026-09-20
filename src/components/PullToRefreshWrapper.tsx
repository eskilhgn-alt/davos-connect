/**
 * PullToRefreshWrapper - Reusable pull-to-refresh UI wrapper
 */

import * as React from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshWrapperProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const PullToRefreshWrapper: React.FC<PullToRefreshWrapperProps> = ({
  onRefresh,
  children,
  className,
  style,
}) => {
  const { containerRef, pullDistance, isRefreshing, isPulling, refreshError } = usePullToRefresh({
    onRefresh,
  });

  const threshold = 80;
  const ready = pullDistance >= threshold;

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={cn("relative min-h-0", className)}
      aria-busy={isRefreshing}
      style={style}
    >
      {/* Pull indicator */}
      {(isPulling || isRefreshing) && (
        <div
          role="status"
          className="absolute left-0 right-0 flex items-center justify-center gap-2 z-10 pointer-events-none"
          style={{ top: 0, height: Math.max(pullDistance, 0) }}
        >
          <div className={cn(
            "flex items-center justify-center rounded-full w-9 h-9",
            "bg-muted/80 backdrop-blur-sm border border-border shadow-sm",
            isRefreshing && "bg-primary/10"
          )}>
            {isRefreshing ? (
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            ) : (
              <ArrowDown
                className={cn(
                  "h-5 w-5 text-muted-foreground transition-transform duration-200",
                  ready && "rotate-180 text-primary"
                )}
              />
            )}
          </div>
          <span className="text-xs font-medium text-foreground">
            {isRefreshing ? "Oppdaterer …" : ready ? "Slipp for å oppdatere" : "Dra ned for å oppdatere"}
          </span>
        </div>
      )}
      {refreshError && (
        <p role="alert" className="p-3 text-center text-sm text-destructive">Kunne ikke oppdatere. Dra ned for å prøve igjen.</p>
      )}

      {/* Content with pull offset */}
      <div
        style={{
          transform: isPulling || isRefreshing ? `translateY(${pullDistance}px)` : undefined,
          transition: !isPulling ? "transform 0.3s ease" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
};
