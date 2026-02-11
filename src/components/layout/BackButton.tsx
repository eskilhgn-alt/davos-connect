/**
 * BackButton - Universal back navigation component
 * Uses history.back() when possible, falls back to home
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
  if (location.pathname === "/" || location.pathname === "/hjem") {
    return null;
  }

  return (
    <button
      onClick={handleBack}
      className={cn(
        "flex items-center gap-1 text-foreground/70 hover:text-foreground tap-target transition-colors",
        className
      )}
      aria-label="Tilbake"
    >
      <ChevronLeft size={24} />
      {label && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
};

export default BackButton;
