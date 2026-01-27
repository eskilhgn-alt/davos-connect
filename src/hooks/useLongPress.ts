import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  onLongPress: (event: React.PointerEvent) => void;
  onClick?: (event: React.PointerEvent) => void;
  delay?: number;
}

interface UseLongPressResult {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerUp: (event: React.PointerEvent) => void;
  onPointerLeave: (event: React.PointerEvent) => void;
  onPointerCancel: (event: React.PointerEvent) => void;
}

export function useLongPress({
  onLongPress,
  onClick,
  delay = 500,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const startPosition = useRef<{ x: number; y: number } | null>(null);

  const start = useCallback((event: React.PointerEvent) => {
    // Only handle primary button (left click/touch)
    if (event.button !== 0) return;
    
    isLongPress.current = false;
    startPosition.current = { x: event.clientX, y: event.clientY };
    
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress(event);
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback((event: React.PointerEvent, shouldClick = false) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // Check if we should trigger click
    if (shouldClick && !isLongPress.current && onClick) {
      // Verify we didn't move too much (10px threshold)
      if (startPosition.current) {
        const dx = Math.abs(event.clientX - startPosition.current.x);
        const dy = Math.abs(event.clientY - startPosition.current.y);
        if (dx < 10 && dy < 10) {
          onClick(event);
        }
      }
    }
    
    startPosition.current = null;
  }, [onClick]);

  return {
    onPointerDown: start,
    onPointerUp: (e) => clear(e, true),
    onPointerLeave: (e) => clear(e, false),
    onPointerCancel: (e) => clear(e, false),
  };
}
