/**
 * ShotButton – Big red "Shoot your shot" button with animated countdown
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
  const [progress, setProgress] = React.useState(1); // 1 = full, 0 = empty

  // Countdown timer with smooth progress
  React.useEffect(() => {
    if (!activeEvent || activeEvent.status !== "countdown" || !activeEvent.countdown_ends_at) {
      setCountdown(null);
      setProgress(1);
      return;
    }

    const endTime = new Date(activeEvent.countdown_ends_at).getTime();
    const startTime = endTime - 10000; // 10 second countdown

    const tick = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      const elapsed = now - startTime;
      const total = endTime - startTime;
      setCountdown(remaining);
      setProgress(Math.max(0, 1 - elapsed / total));
    };

    tick();
    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [activeEvent]);

  const isCountdown = activeEvent?.status === "countdown" && countdown !== null;

  // SVG circle params
  const size = 200;
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex justify-center">
      <div className="relative">
        {/* Progress ring during countdown */}
        {isCountdown && (
          <svg
            width={size + 20}
            height={size + 20}
            className="absolute -top-[10px] -left-[10px] -rotate-90"
          >
            <circle
              cx={(size + 20) / 2}
              cy={(size + 20) / 2}
              r={radius + 4}
              fill="none"
              stroke="hsl(var(--border))"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={(size + 20) / 2}
              cy={(size + 20) / 2}
              r={radius + 4}
              fill="none"
              stroke="hsl(var(--destructive))"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-100 ease-linear"
            />
          </svg>
        )}

        <button
          type="button"
          onClick={onPress}
          disabled={disabled || isCountdown}
          style={{ width: size, height: size }}
          className={cn(
            "relative rounded-full",
            "flex flex-col items-center justify-center",
            "font-heading font-bold text-xl",
            "transition-all duration-200 active:scale-95",
            "shadow-lg",
            isCountdown
              ? "bg-foreground text-background animate-pulse"
              : disabled
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-destructive text-destructive-foreground hover:brightness-110"
          )}
        >
          {isCountdown ? (
            countdown && countdown > 0 ? (
              <>
                <span className="font-heading text-6xl font-bold tabular-nums">
                  {countdown}
                </span>
                <span className="text-sm font-normal mt-1 opacity-70">Trekning...</span>
              </>
            ) : (
              <>
                <span className="text-4xl">🎲</span>
                <span className="text-sm font-normal mt-2">Trekker vinner...</span>
              </>
            )
          ) : loading ? (
            <span className="text-lg">Starter...</span>
          ) : disabled ? (
            <>
              <span className="text-lg">Ingen tokens</span>
              <span className="text-xs font-normal mt-1 opacity-60">Refill i morgen</span>
            </>
          ) : (
            <>
              <span className="text-4xl">🎯</span>
              <span className="mt-2 text-xl">Shoot!</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
