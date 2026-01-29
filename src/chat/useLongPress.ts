/**
 * useLongPress - Simple long press hook for touch/mouse
 * Returns handlers to attach to an element
 */

import * as React from 'react';

interface UseLongPressOptions {
  onLongPress: () => void;
  onPress?: () => void;
  delay?: number;
}

interface UseLongPressResult {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseUp: (e: React.MouseEvent) => void;
  onMouseLeave: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function useLongPress({
  onLongPress,
  onPress,
  delay = 500,
}: UseLongPressOptions): UseLongPressResult {
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = React.useRef(false);
  const startPosRef = React.useRef<{ x: number; y: number } | null>(null);

  const start = React.useCallback((x: number, y: number) => {
    isLongPressRef.current = false;
    startPosRef.current = { x, y };
    
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const clear = React.useCallback((shouldTriggerPress = false) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (shouldTriggerPress && !isLongPressRef.current && onPress) {
      onPress();
    }
    
    startPosRef.current = null;
  }, [onPress]);

  const handleMove = React.useCallback((x: number, y: number) => {
    if (!startPosRef.current) return;
    
    const dx = Math.abs(x - startPosRef.current.x);
    const dy = Math.abs(y - startPosRef.current.y);
    
    // Cancel if moved more than 10px
    if (dx > 10 || dy > 10) {
      clear(false);
    }
  }, [clear]);

  return {
    onTouchStart: (e) => {
      const touch = e.touches[0];
      start(touch.clientX, touch.clientY);
    },
    onTouchEnd: () => {
      clear(true);
    },
    onTouchMove: (e) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    onMouseDown: (e) => {
      if (e.button === 0) { // Left click only
        start(e.clientX, e.clientY);
      }
    },
    onMouseUp: () => {
      clear(true);
    },
    onMouseLeave: () => {
      clear(false);
    },
    onContextMenu: (e) => {
      e.preventDefault();
      onLongPress();
    },
  };
}
