/**
 * AdminAnnouncements – Create/manage system-wide banners
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { Megaphone, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";
import { useAuth } from "@/contexts/AuthContext";

interface Announcement {
  id: string;
  message: string;
  type: string;
  is_active: boolean;
  created_at: string;
}

export const AdminAnnouncements: React.FC = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [message, setMessage] = React.useState("");
  const [type, setType] = React.useState("info");
  const [loading, setLoading] = React.useState(false);

  const fetch = React.useCallback(async () => {
    const { data } = await supabase
      .from("system_announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setAnnouncements((data as Announcement[]) || []);
  }, []);

  React.useEffect(() => { fetch(); }, [fetch]);

  const create = async () => {
    if (!message.trim() || !user) return;
    setLoading(true);
    const { error } = await supabase.from("system_announcements").insert({
      message: message.trim(),
      type,
      created_by: user.id,
    });
    setLoading(false);
    if (error) { errorToast("Kunne ikke opprette"); return; }
    toast.success("Systemvarsel publisert");
    setMessage("");
    fetch();
  };

  const remove = async (id: string) => {
    await supabase.from("system_announcements").update({ is_active: false }).eq("id", id);
    toast.success("Fjernet");
    fetch();
  };

  const typeLabels: Record<string, string> = {
    info: "ℹ️ Info",
    warning: "⚠️ Advarsel",
    maintenance: "🔧 Vedlikehold",
  };

  return (
    <div className="space-y-4">
      <DavosCard>
        <DavosCardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Megaphone size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-sm">Nytt systemvarsel</h3>
          </div>
          <DavosInput
            placeholder="Melding til alle brukere..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="flex gap-2">
            {(["info", "warning", "maintenance"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  type === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {typeLabels[t]}
              </button>
            ))}
          </div>
          <DavosButton onClick={create} disabled={!message.trim() || loading} size="sm" className="w-full">
            {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Megaphone size={14} className="mr-1" />}
            Publiser varsel
          </DavosButton>
        </DavosCardContent>
      </DavosCard>

      {announcements.filter(a => a.is_active).length > 0 && (
        <DavosCard>
          <DavosCardContent className="p-4 space-y-2">
            <h4 className="text-xs text-muted-foreground font-medium">Aktive varsler</h4>
            {announcements.filter(a => a.is_active).map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg p-2">
                <span>{typeLabels[a.type] || a.type}</span>
                <p className="flex-1 text-foreground">{a.message}</p>
                <button onClick={() => remove(a.id)} className="text-destructive hover:text-destructive/80">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </DavosCardContent>
        </DavosCard>
      )}
    </div>
  );
};
