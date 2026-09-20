/**
 * BackButton - Universal back navigation component
 * Always navigates to fallbackPath (default /hjem) with replace:true
 * to avoid nested history stacks inside the PWA shell.
 */

import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface BackButtonProps {
  fallbackPath?: string;
  className?: string;
  label?: string;
}

export const BackButton: React.FC<BackButtonProps> = ({
  fallbackPath = "/hjem",
  className,
  label,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    // Always navigate to home/fallback, not browser back
    navigate(fallbackPath, { replace: true });
  };

  // Don't show on home route only
  if (location.pathname === "/" || location.pathname === "/hjem" || location.pathname === "/hjem/") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={handleBack}
      className={cn(
        "inline-flex h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-xl border border-border bg-muted/50 px-2 text-foreground hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors",
        className
      )}
      aria-label="Tilbake til hjem"
      title="Tilbake til hjem"
    >
      <ChevronLeft size={28} strokeWidth={2.5} aria-hidden="true" />
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
};

export default BackButton;
