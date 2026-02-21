/**
 * RoomiesScreen – Room pairing draw with countdown
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Home, Shuffle, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorToast } from "@/utils/errorToast";

interface RoomMember {
  id: string;
  name: string;
}
interface RoomPair {
  room: number;
  members: RoomMember[];
}
interface RoomieDraw {
  id: string;
  created_by: string;
  status: string;
  pairs: RoomPair[];
  countdown_ends_at: string | null;
  created_at: string;
}

export const RoomiesScreen: React.FC = () => {
  const { user, isAdmin } = useAuth();
  const [draw, setDraw] = React.useState<RoomieDraw | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [drawing, setDrawing] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number | null>(null);

  // Fetch latest draw
  const fetchDraw = React.useCallback(async () => {
    const { data } = await supabase
      .from("roomie_draws")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    const latest = data?.[0] as unknown as RoomieDraw | undefined;
    setDraw(latest || null);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    fetchDraw();
  }, [fetchDraw]);

  // Realtime subscription
  React.useEffect(() => {
    const channel = supabase
      .channel("roomie_draws_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "roomie_draws" }, () => {
        fetchDraw();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDraw]);

  // Countdown timer
  React.useEffect(() => {
    if (!draw || draw.status !== "countdown" || !draw.countdown_ends_at) {
      setCountdown(null);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(draw.countdown_ends_at!).getTime() - Date.now()) / 1000));
      setCountdown(remaining);

      if (remaining <= 0 && isAdmin) {
        // Auto-finalize
        supabase.functions.invoke("roomie-draw", {
          body: { action: "finalize", draw_id: draw.id },
        });
      }
    };

    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [draw, isAdmin]);

  const handleDraw = async () => {
    setDrawing(true);
    try {
      const { data, error } = await supabase.functions.invoke("roomie-draw", {
        body: { action: "draw" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    } catch (err: any) {
      errorToast(err.message || "Kunne ikke starte trekning");
    } finally {
      setDrawing(false);
    }
  };

  const handleReset = async () => {
    try {
      await supabase.functions.invoke("roomie-draw", {
        body: { action: "reset" },
      });
      setDraw(null);
    } catch {
      errorToast("Kunne ikke nullstille");
    }
  };

  const isCountdown = draw?.status === "countdown" && countdown !== null && countdown > 0;
  const isPublished = draw?.status === "published";

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Roomies" leftAction={<BackButton />} />

      <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isCountdown ? (
          /* Countdown state */
          <div className="flex flex-col items-center gap-6 pt-12">
            <div className="w-28 h-28 rounded-full border-4 border-primary flex items-center justify-center animate-pulse">
              <span className="font-heading text-5xl font-black text-primary">{countdown}</span>
            </div>
            <p className="text-muted-foreground text-sm text-center">
              Romfordelingen avsløres om {countdown} sekunder…
            </p>
            <Shuffle size={32} className="text-primary animate-spin" style={{ animationDuration: "3s" }} />
          </div>
        ) : isPublished && draw ? (
          /* Published pairs */
          <div className="space-y-4">
            <div className="text-center space-y-1">
              <h2 className="font-heading text-lg font-bold text-foreground">🏠 Romfordelingen</h2>
              <p className="text-xs text-muted-foreground">
                Trukket {new Date(draw.created_at).toLocaleDateString("nb-NO")}
              </p>
            </div>

            <div className="space-y-3">
              {(draw.pairs || []).map((pair, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-2xl border border-border bg-muted/50 p-4",
                    "flex items-center gap-4"
                  )}
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Home size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Rom {pair.room}
                    </p>
                    <p className="font-heading text-sm font-bold text-foreground truncate">
                      {pair.members.map(m => m.name).join(" & ")}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {isAdmin && (
              <button
                onClick={handleReset}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-medium text-destructive active:scale-[0.97] transition-transform"
              >
                <Trash2 size={16} />
                Nullstill trekning
              </button>
            )}
          </div>
        ) : (
          /* No draw yet */
          <div className="flex flex-col items-center gap-6 pt-12">
            <div className="w-20 h-20 rounded-2xl bg-muted/50 border border-border flex items-center justify-center">
              <Users size={32} className="text-muted-foreground" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="font-heading text-lg font-bold text-foreground">Romfordeling</h2>
              <p className="text-sm text-muted-foreground max-w-xs">
                {isAdmin
                  ? "Trykk på knappen for å trekke tilfeldige rompar blant alle brukere."
                  : "Venter på at admin starter romtrekningen."}
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={handleDraw}
                disabled={drawing}
                className={cn(
                  "flex items-center gap-2 rounded-xl bg-primary px-6 py-3",
                  "text-primary-foreground font-heading font-semibold text-sm",
                  "active:scale-[0.97] transition-all",
                  drawing && "opacity-60"
                )}
              >
                {drawing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Shuffle size={16} />
                )}
                {drawing ? "Trekker…" : "Start trekning"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomiesScreen;
