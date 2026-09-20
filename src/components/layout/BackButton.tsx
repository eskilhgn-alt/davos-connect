/**
 * One home arrow for every app page, including recovery outside the router.
 */

import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export const HomeArrowButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
    aria-label="Tilbake til hjem"
    title="Tilbake til hjem"
  >
    <ArrowLeft size={28} strokeWidth={2.5} aria-hidden="true" />
  </button>
);

export const BackButton: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    navigate("/hjem", { replace: true });
  };

  // Don't show on home route only
  if (location.pathname === "/" || location.pathname === "/hjem" || location.pathname === "/hjem/") {
    return null;
  }

  return <HomeArrowButton onClick={handleBack} />;
};

export default BackButton;
