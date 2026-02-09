import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex flex-col items-center justify-center bg-background px-6 text-center gap-4" style={{ minHeight: "var(--app-height, 100dvh)" }}>
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <span className="text-3xl">🏔️</span>
      </div>
      <h1 className="font-heading text-4xl font-bold text-foreground">404</h1>
      <p className="text-base text-muted-foreground">Siden finnes ikke</p>
      <Link
        to="/hjem"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-95 transition-transform"
      >
        <Home size={16} />
        Tilbake til hjem
      </Link>
    </div>
  );
};

export default NotFound;
