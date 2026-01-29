/**
 * VisualViewport Hook - iPhone PWA Keyboard Handling
 * 
 * Sets CSS variables on :root:
 * - --vvh: visual viewport height
 * - --vvo: visual viewport offset top
 * - --kb: keyboard height (inset)
 * 
 * Toggles html.keyboard-open class when keyboard is detected
 */

import { useEffect, useState } from 'react';

interface ViewportState {
  vvh: number;
  kb: number;
}

export function useVisualViewport(): ViewportState {
  const [state, setState] = useState<ViewportState>({
    vvh: typeof window !== 'undefined' ? window.innerHeight : 800,
    kb: 0,
  });

  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    
    // Baseline: screen height when keyboard is closed
    let baseline = window.innerHeight;

    const update = () => {
      let height: number;
      let offsetTop: number;

      if (vv) {
        height = vv.height;
        offsetTop = vv.offsetTop;
      } else {
        height = window.innerHeight;
        offsetTop = 0;
      }

      // Update baseline when keyboard is closed (height is back to normal)
      if (height >= baseline * 0.9) {
        baseline = Math.max(baseline, height);
      }

      // Calculate keyboard inset
      const kb = Math.max(0, baseline - height - offsetTop);
      const isKeyboardOpen = kb > 50;

      // Set CSS variables
      root.style.setProperty('--vvh', `${height}px`);
      root.style.setProperty('--vvo', `${offsetTop}px`);
      root.style.setProperty('--kb', `${kb}px`);

      // Toggle class for CSS-based hiding of bottom nav
      if (isKeyboardOpen) {
        root.classList.add('keyboard-open');
        root.dataset.keyboard = 'open';
      } else {
        root.classList.remove('keyboard-open');
        root.dataset.keyboard = 'closed';
      }

      setState({ vvh: height, kb });
    };

    // Initial update
    update();

    // Listen to viewport changes
    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }

    // Fallback for non-visualViewport browsers
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        baseline = window.innerHeight;
        update();
      }, 100);
    });

    return () => {
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
      window.removeEventListener('resize', update);
    };
  }, []);

  return state;
}
