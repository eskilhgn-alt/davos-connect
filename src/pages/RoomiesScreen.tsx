/**
 * RoomiesScreen – Room pairing draw with countdown, admin editing, hotel room labels
 */
import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Home, Shuffle, Trash2, Users, Edit2, Check, X, BedDouble } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorToast } from "@/utils/errorToast";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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
  const [editingPairs, setEditingPairs] = React.useState<RoomPair[] | null>(null);
  const [roomLabels, setRoomLabels] = React.useState<Record<string, string>>({});
  const [myRoomLabel, setMyRoomLabel] = React.useState("");
  const [editingMyRoom, setEditingMyRoom] = React.useState(false);
  const [savingRoom, setSavingRoom] = React.useState(false);

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

  // Fetch room labels
  const fetchRoomLabels = React.useCallback(async () => {
    const { data } = await supabase.from("roomie_rooms").select("user_id, room_label");
    if (data) {
      const map: Record<string, string> = {};
      data.forEach((room) => { if (room.room_label) map[room.user_id] = room.room_label; });
      setRoomLabels(map);
    }
  }, []);

  // Fetch my room label
  const fetchMyRoom = React.useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("roomie_rooms")
      .select("room_label")
      .eq("user_id", user.id)
      .maybeSingle();
    setMyRoomLabel(data?.room_label || "");
  }, [user]);

  React.useEffect(() => {
    fetchDraw();
    fetchRoomLabels();
    fetchMyRoom();
  }, [fetchDraw, fetchRoomLabels, fetchMyRoom]);

  // Realtime subscription
  React.useEffect(() => {
    const channel = supabase
      .channel("roomie_draws_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "roomie_draws" }, () => {
        fetchDraw();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "roomie_rooms" }, () => {
        fetchRoomLabels();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDraw, fetchRoomLabels]);

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
    } catch (error: unknown) {
      errorToast(error instanceof Error ? error.message : "Kunne ikke starte trekning");
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

  // Admin: save edited pairs
  const handleSaveEdits = async () => {
    if (!draw || !editingPairs) return;
    try {
      const { error } = await supabase
        .from("roomie_draws")
        .update({ pairs: editingPairs as unknown as import("@/integrations/supabase/types").Json })
        .eq("id", draw.id);
      if (error) throw error;
      toast.success("Romfordeling oppdatert!");
      setEditingPairs(null);
      fetchDraw();
    } catch {
      errorToast("Kunne ikke lagre endringer");
    }
  };

  // Admin: move member between rooms
  const moveMember = (memberId: string, fromRoom: number, toRoom: number) => {
    if (!editingPairs) return;
    const updated = editingPairs.map(p => ({ ...p, members: [...p.members] }));
    const fromPair = updated.find(p => p.room === fromRoom);
    const toPair = updated.find(p => p.room === toRoom);
    if (!fromPair || !toPair) return;
    const memberIdx = fromPair.members.findIndex(m => m.id === memberId);
    if (memberIdx === -1) return;
    const [member] = fromPair.members.splice(memberIdx, 1);
    toPair.members.push(member);
    setEditingPairs(updated);
  };

  // Save my hotel room label
  const handleSaveMyRoom = async () => {
    if (!user) return;
    setSavingRoom(true);
    try {
      const { error } = await supabase
        .from("roomie_rooms")
        .upsert({ user_id: user.id, room_label: myRoomLabel.trim(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      toast.success("Hotellrom lagret!");
      setEditingMyRoom(false);
      fetchRoomLabels();
    } catch {
      errorToast("Kunne ikke lagre hotellrom");
    } finally {
      setSavingRoom(false);
    }
  };

  const isCountdown = draw?.status === "countdown" && countdown !== null && countdown > 0;
  const isPublished = draw?.status === "published";
  const activePairs = editingPairs || draw?.pairs || [];

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

            {/* My hotel room editor */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BedDouble size={16} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Mitt hotellrom</span>
                </div>
                {!editingMyRoom ? (
                  <button onClick={() => setEditingMyRoom(true)} className="text-xs text-primary font-medium">
                    {myRoomLabel ? "Endre" : "Legg inn"}
                  </button>
                ) : null}
              </div>
              {editingMyRoom ? (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={myRoomLabel}
                    onChange={(e) => setMyRoomLabel(e.target.value)}
                    placeholder="F.eks. Rom 412"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    maxLength={50}
                    autoFocus
                  />
                  <button onClick={handleSaveMyRoom} disabled={savingRoom} className="p-2 rounded-lg bg-primary text-primary-foreground">
                    <Check size={16} />
                  </button>
                  <button onClick={() => { setEditingMyRoom(false); fetchMyRoom(); }} className="p-2 rounded-lg bg-muted text-muted-foreground">
                    <X size={16} />
                  </button>
                </div>
              ) : myRoomLabel ? (
                <p className="text-sm text-muted-foreground mt-1">{myRoomLabel}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1 italic">Ikke satt ennå</p>
              )}
            </div>

            {/* Room pairs */}
            <div className="space-y-3">
              {activePairs.map((pair, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-2xl border border-border bg-muted/50 p-4",
                    editingPairs && "border-primary/30"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Home size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-heading text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Rom {pair.room}
                      </p>
                      {pair.members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between">
                          <p className="font-heading text-sm font-bold text-foreground truncate">
                            {m.name}
                            {roomLabels[m.id] && (
                              <span className="text-xs font-normal text-muted-foreground ml-2">
                                ({roomLabels[m.id]})
                              </span>
                            )}
                          </p>
                          {editingPairs && activePairs.length > 1 && (
                            <select
                              className="text-xs bg-background border border-border rounded px-2 py-1 ml-2"
                              value={pair.room}
                              onChange={(e) => moveMember(m.id, pair.room, Number(e.target.value))}
                            >
                              {activePairs.map(p => (
                                <option key={p.room} value={p.room}>Rom {p.room}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Admin controls */}
            {isAdmin && (
              <div className="space-y-2">
                {editingPairs ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEdits}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground active:scale-[0.97] transition-transform"
                    >
                      <Check size={16} />
                      Lagre endringer
                    </button>
                    <button
                      onClick={() => setEditingPairs(null)}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-medium text-muted-foreground active:scale-[0.97] transition-transform"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingPairs(JSON.parse(JSON.stringify(draw.pairs)))}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 py-3 text-sm font-medium text-primary active:scale-[0.97] transition-transform"
                  >
                    <Edit2 size={16} />
                    Rediger romfordeling
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-3 text-sm font-medium text-destructive active:scale-[0.97] transition-transform"
                >
                  <Trash2 size={16} />
                  Nullstill trekning
                </button>
              </div>
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
