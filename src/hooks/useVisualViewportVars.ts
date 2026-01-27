import * as React from 'react';

/**
 * Hook that reads window.visualViewport and sets CSS variables on document.documentElement
 * for robust iPhone PWA keyboard handling.
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

    const update = () => {
      if (vv) {
        const appHeight = vv.height;
        const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        const keyboardOpen = keyboardInset > 120;

        root.style.setProperty('--app-height', `${appHeight}px`);
        root.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
        root.style.setProperty('--keyboard-open', keyboardOpen ? '1' : '0');
        root.dataset.keyboard = keyboardOpen ? 'open' : 'closed';
      } else {
        // Fallback for browsers without visualViewport
        root.style.setProperty('--app-height', `${window.innerHeight}px`);
        root.style.setProperty('--keyboard-inset', '0px');
        root.style.setProperty('--keyboard-open', '0');
        root.dataset.keyboard = 'closed';
      }
    };

    // Initial update
    update();

    // Listen to visualViewport events
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }

    // Also listen to window resize as fallback
    window.addEventListener('resize', update);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
      window.removeEventListener('resize', update);
      
      // Cleanup
      root.style.removeProperty('--app-height');
      root.style.removeProperty('--keyboard-inset');
      root.style.removeProperty('--keyboard-open');
      delete root.dataset.keyboard;
    };
  }, []);
}
