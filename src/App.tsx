import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { ChatLayout } from "@/layouts/ChatLayout";
import ChatScreen from "./pages/ChatScreen";
import MapScreen from "./pages/MapScreen";
import LiveScreen from "./pages/LiveScreen";
import FeedScreen from "./pages/FeedScreen";
import MoreScreen from "./pages/MoreScreen";
import WeatherScreen from "./pages/WeatherScreen";
import GalleryScreen from "./pages/GalleryScreen";
import NotificationsScreen from "./pages/NotificationsScreen";
import WebcamsScreen from "./pages/WebcamsScreen";
import AuthScreen from "./pages/AuthScreen";
import AdminScreen from "./pages/AdminScreen";
import InfoScreen from "./pages/InfoScreen";
import GroupScreen from "./pages/GroupScreen";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient();

// Protected route wrapper
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, profile } = useAuth();

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

  // Require profile completion
  if (user && (!profile?.full_name || !profile?.nickname)) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const AppRoutes = () => (
  <Routes>
    {/* Auth routes (public) */}
    <Route path="/auth" element={<AuthScreen />} />
    
    {/* Protected routes */}
    <Route element={<ProtectedRoute><ChatLayout /></ProtectedRoute>}>
      <Route path="/" element={<ChatScreen />} />
    </Route>
    
    <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
      <Route path="/vaer" element={<WeatherScreen />} />
      <Route path="/live" element={<LiveScreen />} />
      <Route path="/kart" element={<MapScreen />} />
      <Route path="/webcams" element={<WebcamsScreen />} />
      <Route path="/feed" element={<FeedScreen />} />
      <Route path="/mer" element={<MoreScreen />} />
      <Route path="/galleri" element={<GalleryScreen />} />
      <Route path="/varsler" element={<NotificationsScreen />} />
      <Route path="/admin" element={<AdminScreen />} />
      <Route path="/info" element={<InfoScreen />} />
      <Route path="/gruppe" element={<GroupScreen />} />
    </Route>
    
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
