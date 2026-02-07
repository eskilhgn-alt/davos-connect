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
  const { containerRef, pullDistance, isRefreshing, isPulling } = usePullToRefresh({
    onRefresh,
  });

  const threshold = 80;
  const ready = pullDistance >= threshold;

  return (
    <div
      ref={containerRef as React.RefObject<HTMLDivElement>}
      className={cn("relative", className)}
      style={style}
    >
      {/* Pull indicator */}
      {(isPulling || isRefreshing) && (
        <div
          className="absolute left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
          style={{ top: 0, height: Math.max(pullDistance, 0) }}
        >
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
          ) : (
            <ArrowDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform duration-200",
                ready && "rotate-180 text-foreground"
              )}
            />
          )}
        </div>
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
