import * as React from "react";
import { hapticMedium, hapticSuccess } from "@/utils/haptics";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

export function usePullToRefresh({ onRefresh, threshold = 80, maxPull = 120 }: UsePullToRefreshOptions) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isPulling, setIsPulling] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState(false);
  const refreshingRef = React.useRef(false);
  const onRefreshRef = React.useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let startX = 0;
    let startY = 0;
    let pull = 0;
    let tracking = false;
    let dragging = false;
    let crossedThreshold = false;
    let frame = 0;
    let disposed = false;

    const cancelFrame = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const resetGesture = () => {
      tracking = false;
      dragging = false;
      pull = 0;
      cancelFrame();
      setPullDistance(0);
      setIsPulling(false);
    };
    const handleTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      resetGesture();
      // Safari may report a slightly negative scrollTop during rubber-banding.
      if (event.touches.length !== 1 || container.scrollTop > 1) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
      crossedThreshold = false;
      setRefreshError(false);
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!tracking || refreshingRef.current) return;
      if (event.touches.length !== 1 || container.scrollTop > 1) {
        resetGesture();
        return;
      }
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (!dragging) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
        if (dy <= 0 || Math.abs(dx) >= dy) {
          resetGesture();
          return;
        }
        dragging = true;
      }
      // Claim downward motion early, before Safari starts native overscroll.
      if (event.cancelable) event.preventDefault();
      // Monotonic resistance: 160px finger movement reaches the 80px threshold.
      pull = Math.min(Math.max(0, dy) * 0.5, maxPull);
      if (!frame) {
        frame = requestAnimationFrame(() => {
          setPullDistance(pull);
          setIsPulling(pull > 0);
          frame = 0;
        });
      }
      if (!crossedThreshold && pull >= threshold) {
        crossedThreshold = true;
        hapticMedium();
      }
    };
    const handleTouchEnd = async () => {
      if (!tracking) return;
      tracking = false;
      cancelFrame();
      if (pull < threshold || refreshingRef.current) {
        resetGesture();
        return;
      }
      refreshingRef.current = true;
      setIsRefreshing(true);
      setIsPulling(false);
      setPullDistance(threshold * 0.5);
      try {
        await onRefreshRef.current();
        if (!disposed) hapticSuccess();
      } catch {
        if (!disposed) setRefreshError(true);
      } finally {
        refreshingRef.current = false;
        if (!disposed) {
          setIsRefreshing(false);
          resetGesture();
        }
      }
    };
    const handleTouchCancel = () => {
      if (!refreshingRef.current) resetGesture();
    };

    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });
    container.addEventListener("touchend", handleTouchEnd);
    container.addEventListener("touchcancel", handleTouchCancel);
    return () => {
      disposed = true;
      cancelFrame();
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [threshold, maxPull]);

  return { containerRef, pullDistance, isRefreshing, isPulling, refreshError };
}
