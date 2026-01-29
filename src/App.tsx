import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout";
import { ChatLayout } from "@/layouts/ChatLayout";
import ChatScreen from "./pages/ChatScreen";
import MapScreen from "./pages/MapScreen";
import FeedScreen from "./pages/FeedScreen";
import MoreScreen from "./pages/MoreScreen";
import WeatherScreen from "./pages/WeatherScreen";
import GalleryScreen from "./pages/GalleryScreen";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<ChatLayout />}>
            <Route path="/" element={<ChatScreen />} />
          </Route>
          
          <Route element={<AppLayout />}>
            <Route path="/vaer" element={<WeatherScreen />} />
            <Route path="/kart" element={<MapScreen />} />
            <Route path="/feed" element={<FeedScreen />} />
            <Route path="/mer" element={<MoreScreen />} />
            <Route path="/galleri" element={<GalleryScreen />} />
          </Route>
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
