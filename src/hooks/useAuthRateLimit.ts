/**
 * Client-side rate limiter for auth attempts.
 * Blocks login/signup after too many failed attempts.
 */
import { useState, useCallback } from "react";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 min lockout

interface RateLimitState {
  attempts: number;
  lockedUntil: number | null;
}

export const useAuthRateLimit = () => {
  const [state, setState] = useState<RateLimitState>({ attempts: 0, lockedUntil: null });

  const isLocked = useCallback(() => {
    if (!state.lockedUntil) return false;
    if (Date.now() > state.lockedUntil) {
      setState({ attempts: 0, lockedUntil: null });
      return false;
    }
    return true;
  }, [state.lockedUntil]);

  const remainingLockSeconds = useCallback(() => {
    if (!state.lockedUntil) return 0;
    return Math.max(0, Math.ceil((state.lockedUntil - Date.now()) / 1000));
  }, [state.lockedUntil]);

  const recordAttempt = useCallback((success: boolean) => {
    if (success) {
      setState({ attempts: 0, lockedUntil: null });
      return;
    }
    setState((prev) => {
      const newAttempts = prev.attempts + 1;
      if (newAttempts >= MAX_ATTEMPTS) {
        return { attempts: newAttempts, lockedUntil: Date.now() + LOCKOUT_MS };
      }
      return { attempts: newAttempts, lockedUntil: null };
    });
  }, []);

  return { isLocked, remainingLockSeconds, recordAttempt, attempts: state.attempts };
};
