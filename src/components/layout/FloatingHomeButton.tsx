/**
 * FloatingHomeButton – Small, unobtrusive home button
 * Positioned bottom-left to avoid conflict with inputs/composers
 * Hidden on home screen and when keyboard is open
 */
import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";

export const FloatingHomeButton: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false);

  const isHome = location.pathname === "/" || location.pathname === "/hjem";

  React.useEffect(() => {
    const check = () => setIsKeyboardOpen(document.documentElement.dataset.keyboard === "open");
    check();
    const obs = new MutationObserver(() => check());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-keyboard"] });
    return () => obs.disconnect();
  }, []);

  if (isHome || isKeyboardOpen) return null;

  return (
    <button
      onClick={() => navigate("/hjem")}
      className={cn(
        "fixed z-50 flex items-center justify-center",
        "w-11 h-11 rounded-full",
        "bg-[#103A5D] border-2 border-[#F4CD3C]/40",
        "shadow-md shadow-[#103A5D]/30 active:scale-95 transition-all duration-150"
      )}
      style={{
        bottom: `calc(12px + env(safe-area-inset-bottom))`,
        left: "12px",
      }}
      aria-label="Hjem"
    >
      <Home size={16} strokeWidth={2} className="text-[#F4CD3C]" />
    </button>
  );
};
