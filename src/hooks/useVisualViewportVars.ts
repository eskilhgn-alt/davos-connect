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
    
    // Store baseline height when keyboard is closed (initial window height)
    let baselineHeight = window.innerHeight;
    let isFocusedOnInput = false;
    let focusTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const setKeyboardState = (open: boolean, keyboardInset: number, appHeight: number) => {
      root.style.setProperty('--app-height', `${appHeight}px`);
      root.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
      root.style.setProperty('--keyboard-open', open ? '1' : '0');
      // Also set bottom-nav effective height for immediate JS-based updates
      root.style.setProperty('--bottom-nav-h-effective', open ? '0px' : 'var(--bottom-nav-h)');
      root.dataset.keyboard = open ? 'open' : 'closed';
    };

    const update = () => {
      if (vv) {
        const currentHeight = vv.height;
        
        // Update baseline when keyboard is definitely closed
        // Use a larger threshold to account for iOS toolbars
        if (!isFocusedOnInput && currentHeight >= baselineHeight * 0.85) {
          baselineHeight = Math.max(baselineHeight, currentHeight);
        }
        
        const keyboardInset = Math.max(0, baselineHeight - currentHeight);
        
        // Consider keyboard open if:
        // 1. We're focused on an input AND
        // 2. There's significant height difference (>40px to account for toolbars)
        const keyboardOpen = isFocusedOnInput && keyboardInset > 40;

        setKeyboardState(keyboardOpen, keyboardOpen ? keyboardInset : 0, currentHeight);
      } else {
        // Fallback for browsers without visualViewport
        const appHeight = window.innerHeight;
        // Use focus state as primary indicator when no visualViewport
        setKeyboardState(isFocusedOnInput, 0, appHeight);
      }
    };

    // Focus-based detection - critical for iOS PWA where visualViewport can lag
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
        
        // Immediate update for snappy keyboard detection
        // Use RAF to ensure we catch any viewport changes
        requestAnimationFrame(() => {
          update();
          // Double-check after a short delay for iOS lag
          setTimeout(update, 100);
        });
      }
    };

    const handleFocusOut = () => {
      // Delay to avoid flapping during focus transitions between inputs
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
