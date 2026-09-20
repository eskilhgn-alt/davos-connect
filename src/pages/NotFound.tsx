import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex flex-col bg-background" style={{ minHeight: "var(--app-height, 100dvh)" }}>
      <AppHeader title="Siden finnes ikke" />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-3xl">🏔️</span>
        </div>
        <h1 className="font-heading text-4xl font-bold text-foreground">404</h1>
        <p className="text-base text-muted-foreground">Siden finnes ikke</p>
      </div>
    </div>
  );
};

export default NotFound;
