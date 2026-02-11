/**
 * SystemBanner – Shows active system announcements to all users
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Info, Wrench, X } from "lucide-react";

interface Announcement {
  id: string;
  message: string;
  type: string;
  created_at: string;
}

export const SystemBanner: React.FC = () => {
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    supabase
      .from("system_announcements")
      .select("id, message, type, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setAnnouncements(data);
      });
  }, []);

  const visible = announcements.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  const iconMap: Record<string, React.ReactNode> = {
    info: <Info size={16} />,
    warning: <AlertTriangle size={16} />,
    maintenance: <Wrench size={16} />,
  };

  const colorMap: Record<string, string> = {
    info: "bg-primary/10 border-primary/20 text-primary",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
    maintenance: "bg-muted border-border text-muted-foreground",
  };

  return (
    <div className="space-y-1 px-4 pt-2">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${colorMap[a.type] || colorMap.info}`}
        >
          <span className="mt-0.5 shrink-0">{iconMap[a.type] || iconMap.info}</span>
          <p className="flex-1">{a.message}</p>
          <button
            onClick={() => setDismissed((s) => new Set(s).add(a.id))}
            className="shrink-0 mt-0.5 opacity-60 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
};
