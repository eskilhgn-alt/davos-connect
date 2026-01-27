import * as React from 'react';

/**
 * Hook that reads window.visualViewport and sets CSS variables on document.documentElement
 * for robust iPhone PWA keyboard handling.
 * 
 * Uses both VisualViewport API and focus-based fallback for reliable iOS PWA detection.
 * 
 * Sets:
 * - --app-height: visualViewport.height (or innerHeight fallback)
 * - --keyboard-inset: calculated keyboard height in px
 * - --keyboard-open: 0 or 1
 * - data-keyboard attribute: "open" or "closed"
 */
export function useVisualViewportVars() {
  React.useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    
    // Store baseline height when keyboard is closed
    let baselineHeight = window.innerHeight;
    let isFocusedOnInput = false;
    let focusTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const setKeyboardState = (open: boolean, keyboardInset: number, appHeight: number) => {
      root.style.setProperty('--app-height', `${appHeight}px`);
      root.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
      root.style.setProperty('--keyboard-open', open ? '1' : '0');
      root.dataset.keyboard = open ? 'open' : 'closed';
    };

    const update = () => {
      if (vv) {
        const currentHeight = vv.height;
        
        // Update baseline when keyboard is definitely closed
        if (!isFocusedOnInput && currentHeight >= baselineHeight * 0.9) {
          baselineHeight = Math.max(baselineHeight, currentHeight);
        }
        
        const keyboardInset = Math.max(0, baselineHeight - currentHeight);
        // Lower threshold (50px) for more reliable detection
        const keyboardOpen = isFocusedOnInput && keyboardInset > 50;

        setKeyboardState(keyboardOpen, keyboardInset, currentHeight);
      } else {
        // Fallback for browsers without visualViewport
        const appHeight = window.innerHeight;
        // Use focus state as primary indicator when no visualViewport
        setKeyboardState(isFocusedOnInput, 0, appHeight);
      }
    };

    // Focus-based fallback for iOS PWA where visualViewport can be unreliable
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Clear any pending focusout timeout
        if (focusTimeoutId) {
          clearTimeout(focusTimeoutId);
          focusTimeoutId = null;
        }
        isFocusedOnInput = true;
        // Immediate update for snappy response
        update();
      }
    };

    const handleFocusOut = () => {
      // Delay to avoid flapping during focus transitions
      focusTimeoutId = setTimeout(() => {
        isFocusedOnInput = false;
        update();
        focusTimeoutId = null;
      }, 150);
    };

    // Initial update
    update();

    // Listen to visualViewport events
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }

    // Focus events for robust iOS PWA detection
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Window resize as fallback
    window.addEventListener('resize', update);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      window.removeEventListener('resize', update);
      
      if (focusTimeoutId) {
        clearTimeout(focusTimeoutId);
      }
      
      // Cleanup
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--keyboard-inset');
      root.style.removeProperty('--keyboard-open');
      delete root.dataset.keyboard;
    };
  }, []);
}
