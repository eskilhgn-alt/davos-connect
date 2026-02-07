/**
 * ShotButton – Big red "Shoot your shot" button with countdown overlay
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ShotEvent } from "@/pages/ShotScreen";

interface ShotButtonProps {
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  activeEvent: ShotEvent | null;
}

export const ShotButton: React.FC<ShotButtonProps> = ({
  onPress,
  disabled,
  loading,
  activeEvent,
}) => {
  const [countdown, setCountdown] = React.useState<number | null>(null);

  // Countdown timer
  React.useEffect(() => {
    if (!activeEvent || activeEvent.status !== "countdown" || !activeEvent.countdown_ends_at) {
      setCountdown(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(activeEvent.countdown_ends_at!).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
    };

    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [activeEvent]);

  const isCountdown = activeEvent?.status === "countdown" && countdown !== null && countdown > 0;
  const isActive = !!activeEvent;

  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onPress}
        disabled={disabled || isActive}
        className={cn(
          "relative w-full max-w-xs aspect-square rounded-full",
          "flex flex-col items-center justify-center",
          "font-heading font-bold text-xl",
          "transition-all duration-200 active:scale-95",
          "shadow-lg",
          isCountdown
            ? "bg-foreground text-background"
            : isActive
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : disabled
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-destructive text-destructive-foreground hover:brightness-110"
        )}
      >
        {isCountdown ? (
          <>
            <span className="font-heading text-6xl font-bold tabular-nums">
              {countdown}
            </span>
            <span className="text-sm font-normal mt-1 opacity-70">Trekning...</span>
          </>
        ) : loading ? (
          <span className="text-lg">Starter...</span>
        ) : isActive ? (
          <span className="text-lg">Runde pågår</span>
        ) : disabled ? (
          <>
            <span className="text-lg">Ingen tokens</span>
            <span className="text-xs font-normal mt-1 opacity-60">Refill i morgen</span>
          </>
        ) : (
          <>
            <span className="text-2xl">🎯</span>
            <span className="mt-2">Shoot!</span>
          </>
        )}
      </button>
    </div>
  );
};
