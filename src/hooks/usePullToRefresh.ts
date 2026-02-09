import * as React from "react";
import { hapticMedium, hapticSuccess } from "@/utils/haptics";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

interface UsePullToRefreshReturn {
  containerRef: React.RefObject<HTMLDivElement>;
  pullDistance: number;
  isRefreshing: boolean;
  isPulling: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 120
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isPulling, setIsPulling] = React.useState(false);
  
  const startY = React.useRef(0);
  const pullRef = React.useRef(0);
  const touchingRef = React.useRef(false);
  const rafRef = React.useRef<number>(0);
  const thresholdCrossedRef = React.useRef(false);

  const onRefreshRef = React.useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (container.scrollTop > 0 || isRefreshing) return;
      startY.current = e.touches[0].clientY;
      touchingRef.current = true;
      thresholdCrossedRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchingRef.current || isRefreshing) return;
      
      const diff = e.touches[0].clientY - startY.current;
      
      if (diff > 0 && container.scrollTop === 0) {
        // Rubber-band resistance curve for natural feel
        const resistance = Math.max(0.2, 0.6 - (diff / 800));
        const pull = Math.min(diff * resistance, maxPull);
        pullRef.current = pull;
        
        // Use rAF for smooth 60fps updates
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            setPullDistance(pullRef.current);
            setIsPulling(true);
            rafRef.current = 0;
          });
        }
        
        // Haptic when crossing threshold (once per gesture)
        if (!thresholdCrossedRef.current && pull >= threshold) {
          thresholdCrossedRef.current = true;
          hapticMedium();
        }
        
        if (pull > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!touchingRef.current) return;
      touchingRef.current = false;
      
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      
      if (pullRef.current >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(threshold * 0.5);
        
        try {
          await onRefreshRef.current();
          hapticSuccess();
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
          setIsPulling(false);
          pullRef.current = 0;
        }
      } else {
        setPullDistance(0);
        setIsPulling(false);
        pullRef.current = 0;
      }
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [threshold, maxPull, isRefreshing]);

  return {
    containerRef,
    pullDistance,
    isRefreshing,
    isPulling
  };
}