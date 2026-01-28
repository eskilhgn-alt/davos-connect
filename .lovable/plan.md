

## Sprint 2.13: PWA iPhone Chat UX - Messenger-Style Rewrite

### Problem Analysis

Based on the code review, the current implementation has these issues:

1. **Dynamic container height shrinks everything** - Using `height: var(--app-height)` causes the entire chat container to shrink when the keyboard opens. Combined with flex layout, this shrinks the message list proportionally.

2. **Double compensation for keyboard** - The composer has `paddingBottom: calc(var(--bottom-nav-h-effective) + var(--keyboard-inset))`, but since `--app-height` also changes, this creates unpredictable behavior.

3. **The Messenger model isn't properly implemented** - In real Messenger, the composer is **fixed to the screen bottom** (not to the flex container), and the message list has static padding at bottom.

---

### Solution: Fixed Composer + Static Message List Height

The fix requires restructuring ChatScreen to use a **fixed-position composer** that floats above the keyboard, while the message list uses the full available height (not dynamically shrinking).

---

### Changes to Implement

#### 1. `src/pages/ChatScreen.tsx` - Complete Layout Restructure

```tsx
// ROOT: Use fixed inset-0 (full screen), NOT dynamic --app-height
<div className="fixed inset-0 flex flex-col overflow-hidden">
  
  {/* Header - sticky at top, respects safe-area */}
  <AppHeader ... className="safe-area-top" />
  
  {/* Message list - fills all space between header and composer */}
  {/* Padding-bottom is STATIC: composer height + bottom-nav + safe-area */}
  <ChatMessageList
    className="flex-1 min-h-0"
    bottomPadding={composerHeight + bottomNavHeight + safeAreaBottom}
  />
  
  {/* Composer - FIXED at bottom, positioned above keyboard */}
  <div 
    className="fixed left-0 right-0 bg-background border-t"
    style={{ 
      // Position above keyboard when open, above bottom-nav when closed
      bottom: 'calc(env(safe-area-inset-bottom) + var(--keyboard-inset, 0px))',
      // When keyboard closed, also account for bottom nav
      // When keyboard open, --bottom-nav-h-effective is 0
      paddingBottom: 'var(--bottom-nav-h-effective, 0px)'
    }}
  >
    <ChatComposer ... />
  </div>
</div>
```

**Key changes:**
- Root container: `fixed inset-0` instead of `height: var(--app-height)`
- Composer: `position: fixed` with `bottom` calculated from keyboard inset
- Message list: Static padding that doesn't change with keyboard

---

#### 2. `src/hooks/useVisualViewportVars.ts` - Improved Keyboard Detection

Current implementation is mostly good, but needs refinement:

```typescript
// More aggressive scroll-to-bottom trigger when keyboard opens
// Add a callback mechanism or custom event for chat to react

const setKeyboardState = (open: boolean, keyboardInset: number, appHeight: number) => {
  root.style.setProperty('--app-height', `${appHeight}px`);
  root.style.setProperty('--keyboard-inset', `${keyboardInset}px`);
  root.style.setProperty('--keyboard-open', open ? '1' : '0');
  root.style.setProperty('--bottom-nav-h-effective', open ? '0px' : 'var(--bottom-nav-h)');
  root.dataset.keyboard = open ? 'open' : 'closed';
  
  // NEW: Dispatch custom event for components that need to react
  window.dispatchEvent(new CustomEvent('keyboard-state-change', { 
    detail: { open, keyboardInset, appHeight } 
  }));
};
```

---

#### 3. `src/components/chat/ChatMessageList.tsx` - Keyboard-Aware Auto-Scroll

Add listener for keyboard state changes:

```typescript
// When keyboard opens and user is at bottom, scroll to bottom after layout settles
React.useEffect(() => {
  const handleKeyboardChange = (e: CustomEvent) => {
    if (e.detail.open && isAtBottomRef.current) {
      // Wait for layout to settle, then scroll
      requestAnimationFrame(() => {
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      });
    }
  };
  
  window.addEventListener('keyboard-state-change', handleKeyboardChange);
  return () => window.removeEventListener('keyboard-state-change', handleKeyboardChange);
}, []);
```

---

#### 4. `src/components/layout/BottomNavigation.tsx` - Verify Full Unmount

Current implementation already unmounts when keyboard is open (return null). Verify this is working correctly:

```typescript
// The current approach is correct - full unmount prevents iOS from
// dragging the fixed element up with keyboard
if (isKeyboardOpen) {
  return null;
}
```

---

#### 5. `src/index.css` - CSS Variable Cleanup

Ensure consistent variable usage:

```css
:root {
  --bottom-nav-h: calc(4rem + env(safe-area-inset-bottom));
  --bottom-nav-h-effective: var(--bottom-nav-h);
  --keyboard-inset: 0px;
}

:root[data-keyboard="open"] {
  --bottom-nav-h-effective: 0px;
}
```

---

### Acceptance Criteria Verification

| Criterion | Implementation |
|-----------|----------------|
| No iOS zoom on input focus | Already have `font-size: 16px !important` in CSS |
| Chat history visible while typing | Fixed composer + static message list padding |
| Bottom nav hidden when keyboard open | BottomNavigation unmounts (`return null`) |
| Auto-scroll works correctly | Custom event listener + RAF + timeout |
| No layout jumping | Fixed positioning instead of dynamic height |
| Safe-area respected | `env(safe-area-inset-bottom)` in composer bottom calc |

---

### Files to Modify

1. **`src/pages/ChatScreen.tsx`** - Major restructure to fixed layout model
2. **`src/hooks/useVisualViewportVars.ts`** - Add custom event dispatch
3. **`src/components/chat/ChatMessageList.tsx`** - Add keyboard state listener for auto-scroll
4. **`src/index.css`** - Minor cleanup (optional)

---

### Testing Checklist

After implementation, test on iPhone (Safari + Add to Home Screen):

1. Tap in composer - keyboard should open, history stays visible
2. Type multiple lines - composer grows, no layout collapse
3. Scroll up in chat while keyboard open - should work smoothly
4. Hide keyboard - bottom nav reappears, no layout jump
5. Rotate device - layout should adapt correctly
6. Send message with attachment - UI stays stable

