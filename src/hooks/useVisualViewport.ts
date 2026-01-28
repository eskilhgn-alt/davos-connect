/**
 * VisualViewport Hook for PWA iPhone Keyboard Handling
 * 
 * Sets CSS variables on :root for stable layout:
 * - --vvh: visualViewport height
 * - --vvo: visualViewport offsetTop  
 * - --keyboard-inset: space taken by keyboard
 * 
 * Also toggles html.keyboard-open class for CSS hiding of bottom nav
 */

import { useEffect } from 'react';

export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const root = document.documentElement;
    
    // Capture baseline height when keyboard is definitely closed
    let baselineHeight = window.innerHeight;
    
    const update = () => {
      const currentHeight = vv.height;
      const offsetTop = vv.offsetTop;
      
      // Update baseline when keyboard is closed (viewport is tall again)
      if (currentHeight >= baselineHeight * 0.9) {
        baselineHeight = Math.max(baselineHeight, currentHeight);
      }
      
      // Calculate keyboard inset (how much keyboard is taking)
      const keyboardInset = Math.max(0, baselineHeight - currentHeight - offsetTop);
      const isKeyboardOpen = keyboardInset > 50; // Threshold for keyboard detection
      
      // Set CSS variables
      root.style.setProperty('--vvh', `${currentHeight}px`);
      root.style.setProperty('--vvo', `${offsetTop}px`);
      root.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
      root.style.setProperty('--app-height', `${currentHeight}px`);
      
      // Toggle keyboard-open class for CSS-based hiding
      if (isKeyboardOpen) {
        root.classList.add('keyboard-open');
        root.dataset.keyboard = 'open';
      } else {
        root.classList.remove('keyboard-open');
        root.dataset.keyboard = 'closed';
      }
      
      // Dispatch event for components that need to react
      window.dispatchEvent(new CustomEvent('keyboard-state-change', {
        detail: { 
          open: isKeyboardOpen, 
          keyboardInset, 
          viewportHeight: currentHeight 
        }
      }));
    };

    // Initial update
    update();

    // Listen to viewport changes
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);

    // Also update on orientation change
    window.addEventListener('orientationchange', () => {
      // Reset baseline on orientation change
      setTimeout(() => {
        baselineHeight = window.innerHeight;
        update();
      }, 100);
    });

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}
