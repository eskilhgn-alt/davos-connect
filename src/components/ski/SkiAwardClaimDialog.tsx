/**
 * SkiAwardClaimDialog – Modal for daily ski winner to choose frikort or token
 */
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Mountain, Ticket, Coins } from "lucide-react";

interface Award {
  id: string;
  day_date: string;
  vertical_meters: number;
  claimed: boolean;
}

export const SkiAwardClaimDialog: React.FC = () => {
  const { user } = useAuth();
  const [award, setAward] = React.useState<Award | null>(null);
  const [claiming, setClaiming] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    const check = async () => {
      const { data } = await supabase
        .from("ski_daily_awards")
        .select("id, day_date, vertical_meters, claimed")
        .eq("user_id", user.id)
        .eq("claimed", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setAward(data[0] as unknown as Award);
      }
    };
    check();
  }, [user]);

  const claim = async (choice: "frikort" | "token") => {
    if (!award || claiming) return;
    setClaiming(true);
    const { error } = await supabase.rpc("rpc_claim_ski_award", {
      p_award_id: award.id,
      p_choice: choice,
    });
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(
        choice === "frikort"
          ? "Frikort mottatt! 🎫 Bruk det for å stå over en shot."
          : "Ekstra token mottatt! 🪙"
      );
      setAward(null);
    }
    setClaiming(false);
  };

  if (!award) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-background border border-border rounded-2xl p-6 w-full max-w-sm space-y-5 animate-in slide-in-from-bottom-4">
        <div className="text-center space-y-2">
          <Mountain size={32} className="mx-auto text-foreground" />
          <h2 className="font-heading text-lg font-bold text-foreground">
            Mest høydemeter! 🏔️
          </h2>
          <p className="text-sm text-muted-foreground">
            Du logget {Math.round(award.vertical_meters)}m i går – best av alle!
          </p>
          <p className="text-sm text-muted-foreground">
            Velg belønning:
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => claim("frikort")}
            disabled={claiming}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-foreground/30 transition-colors active:scale-[0.98]"
          >
            <Ticket size={24} className="text-foreground shrink-0" />
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Frikort</p>
              <p className="text-xs text-muted-foreground">
                Stå over en shot neste gang du blir trukket
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => claim("token")}
            disabled={claiming}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-foreground/30 transition-colors active:scale-[0.98]"
          >
            <Coins size={24} className="text-foreground shrink-0" />
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Ekstra token (+1)</p>
              <p className="text-xs text-muted-foreground">
                Bruk den til å starte flere runder
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
