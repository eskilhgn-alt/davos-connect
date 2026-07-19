/**
 * PopupAnnouncement – Full-screen overlay for critical announcements (type=popup)
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, AlertTriangle } from "lucide-react";
import { BrandButton } from "@/components/ui/brand-button";

interface PopupAnnouncement {
  id: string;
  message: string;
  created_at: string;
}

export const PopupAnnouncementOverlay: React.FC = () => {
  const [popup, setPopup] = React.useState<PopupAnnouncement | null>(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("dismissed_popups");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  React.useEffect(() => {
    supabase
      .from("system_announcements")
      .select("id, message, created_at")
      .eq("is_active", true)
      .eq("type", "popup")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0 && !dismissed.has(data[0].id)) {
          setPopup(data[0]);
        }
      });
  }, [dismissed]);

  const dismiss = () => {
    if (!popup) return;
    const next = new Set(dismissed).add(popup.id);
    setDismissed(next);
    try {
      localStorage.setItem("dismissed_popups", JSON.stringify([...next]));
    } catch {}
    setPopup(null);
  };

  if (!popup) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
      <div className="bg-card border border-border rounded-2xl max-w-sm w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-300">
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className="h-12 w-12 rounded-full bg-accent/10 flex items-center justify-center">
            <AlertTriangle size={24} className="text-accent" />
          </div>
          <h2 className="font-heading font-bold text-lg text-foreground">
            Viktig melding
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {popup.message}
          </p>
          <BrandButton onClick={dismiss} className="w-full mt-2">
            Forstått
          </BrandButton>
        </div>
      </div>
    </div>
  );
};
