import * as React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { ChatLayout } from "@/layouts/ChatLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { prefetchWeatherAiSummary } from "@/hooks/useWeatherAiSummary";
import { toast } from "sonner";
import ChatScreen from "./pages/ChatScreen";
import HomeScreen from "./pages/HomeScreen";
import MapScreen from "./pages/MapScreen";
import CrewMapScreen from "./pages/CrewMapScreen";
import LiveScreen from "./pages/LiveScreen";
import GalleryScreen from "./pages/GalleryScreen";
import FeedScreen from "./pages/FeedScreen";
import MoreScreen from "./pages/MoreScreen";
import WeatherScreen from "./pages/WeatherScreen";
import ShotScreen from "./pages/ShotScreen";
import AgendaScreen from "./pages/AgendaScreen";
import TokensScreen from "./pages/TokensScreen";
import FaktasjekkerScreen from "./pages/FaktasjekkerScreen";
import StoriesScreen from "./pages/StoriesScreen";
import RulesScreen from "./pages/RulesScreen";
import PollScreen from "./pages/PollScreen";

import SettingsScreen from "./pages/SettingsScreen";
import WebcamsScreen from "./pages/WebcamsScreen";
import AuthScreen from "./pages/AuthScreen";
import AdminScreen from "./pages/AdminScreen";
import GroupScreen from "./pages/GroupScreen";
import ResetPasswordScreen from "./pages/ResetPasswordScreen";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

// Start fetching weather AI data immediately on app load
prefetchWeatherAiSummary();

const queryClient = new QueryClient();

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, profile, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Require profile completion (including avatar)
  if (user && (!profile?.full_name || !profile?.nickname || !profile?.avatar_url)) {
    return <Navigate to="/auth" replace />;
  }

  // Check for ban (admin can still access)
  if (profile?.is_banned && !isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-8 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🚫</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground">Midlertidig utestengt</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          {profile.ban_reason || "Du er midlertidig utestengt. Kontakt admin for å få tilgang igjen."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    {/* Auth routes (public) */}
    <Route path="/auth" element={<AuthScreen />} />
    <Route path="/reset-password" element={<ResetPasswordScreen />} />
    
    {/* Protected routes - Chat with its own layout */}
    <Route element={<ProtectedRoute><ChatLayout /></ProtectedRoute>}>
      <Route path="/chat" element={<ChatScreen />} />
    </Route>
    
    {/* Protected routes - App layout with bottom nav */}
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="/" element={<Navigate to="/hjem" replace />} />
      <Route path="/hjem" element={<HomeScreen />} />
      <Route path="/vaer" element={<WeatherScreen />} />
      <Route path="/live" element={<LiveScreen />} />
      <Route path="/kart" element={<MapScreen />} />
      <Route path="/magnus" element={<CrewMapScreen />} />
      <Route path="/webcams" element={<WebcamsScreen />} />
      <Route path="/feed" element={<FeedScreen />} />
      <Route path="/mer" element={<MoreScreen />} />
      {/* Gallery */}
      <Route path="/galleri" element={<GalleryScreen />} />
      <Route path="/innstillinger" element={<SettingsScreen />} />
      <Route path="/admin" element={<AdminScreen />} />
      <Route path="/gruppe" element={<GroupScreen />} />
      <Route path="/shot" element={<ShotScreen />} />
      <Route path="/tokens" element={<TokensScreen />} />
      <Route path="/agenda" element={<AgendaScreen />} />
      <Route path="/faktasjekker" element={<FaktasjekkerScreen />} />
      <Route path="/historier" element={<StoriesScreen />} />
      <Route path="/regler" element={<RulesScreen />} />
      <Route path="/poll" element={<PollScreen />} />
    </Route>
    
    <Route path="*" element={<NotFound />} />
  </Routes>
);

// Global PWA hardening — prevents silent async crashes + browser context menu
const useGlobalPwaHardening = () => {
  React.useEffect(() => {
    // Unhandled promise rejections
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
      toast.error("En uventet feil oppstod");
      event.preventDefault();
    };
    window.addEventListener("unhandledrejection", rejectionHandler);

    // Block browser context menu globally (long-press on mobile)
    const contextHandler = (e: MouseEvent) => {
      // Allow context menu on inputs/textareas for paste functionality
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", contextHandler);

    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
      document.removeEventListener("contextmenu", contextHandler);
    };
  }, []);
};

const AppShell = () => {
  useGlobalPwaHardening();
  return (
    <>
      <Toaster />
      <Sonner />
      <OfflineIndicator />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
