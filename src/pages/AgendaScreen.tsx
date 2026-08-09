/**
 * AgendaScreen — vertikal, kronologisk tidslinje for valgt tur.
 *
 * Ingen kalendergrid og ingen ukevelger: hele turens tidslinje lastes og
 * grupperes på lokal dato i turens tidssone. Aktiviteter utenfor turdatoene
 * slettes aldri — de vises som «Utenfor turdatoene».
 */
import * as React from "react";
import { Plus, CalendarDays, Clock } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { useAgenda, type AgendaEvent } from "@/hooks/useAgenda";
import { AgendaEventDialog } from "@/components/agenda/AgendaEventDialog";
import { pickFocusEventId } from "@/features/agenda/timeline";
import { formatTripDateRange, formatZonedTime } from "@/features/trip/tripDates";
import { cn } from "@/lib/utils";
import { markPageSeen } from "@/hooks/useAppBadges";
import { useTrip } from "@/contexts/TripContext";

const colorMap: Record<string, string> = {
  primary: "bg-primary",
  destructive: "bg-destructive",
  accent: "bg-accent",
  yellow: "bg-[hsl(var(--brand-yellow))]",
};

export const AgendaScreen: React.FC = () => {
  const { selectedTripId, selectedTrip, isArchive } = useTrip();
  React.useEffect(() => {
    markPageSeen("agenda", selectedTripId);
  }, [selectedTripId]);

  const { timeline, loading, error, createEvent, updateEvent, deleteEvent } = useAgenda();
  const tz = selectedTrip?.timezone ?? "UTC";

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editEvent, setEditEvent] = React.useState<AgendaEvent | null>(null);

  const focusId = React.useMemo(() => pickFocusEventId(timeline), [timeline]);
  const focusRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!focusId || !focusRef.current) return;
    focusRef.current.scrollIntoView({ block: "center" });
  }, [focusId]);

  const openNew = () => {
    setEditEvent(null);
    setDialogOpen(true);
  };

  const totalEvents = timeline.reduce((n, d) => n + d.events.length, 0);

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Agenda" leftAction={<BackButton fallbackPath="/hjem" />} />

      <div className="border-b border-border px-4 py-2">
        <p className="text-[11px] text-muted-foreground">
          {selectedTrip ? `${selectedTrip.name} · ${formatTripDateRange(selectedTrip)}` : "Ingen tur valgt"}
          {isArchive ? " · Arkiv" : ""}
        </p>
      </div>

      {error && (
        <div role="alert" className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="px-4 py-4" style={{ paddingBottom: "calc(var(--bottom-nav-h-effective) + 96px)" }}>
          {loading && totalEvents === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Laster agenda…</p>
          )}

          {!loading && totalEvents === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CalendarDays size={28} className="text-muted-foreground" strokeWidth={1.6} />
              <p className="font-heading text-base font-semibold text-foreground">Ingen planer ennå</p>
              {!isArchive && (
                <button
                  onClick={openNew}
                  className="rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform"
                >
                  Legg til aktivitet
                </button>
              )}
            </div>
          )}

          <ol className="space-y-6">
            {timeline.map((day) => (
              <li key={day.dateKey}>
                <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-1.5 backdrop-blur">
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-heading text-sm font-semibold capitalize text-foreground">{day.heading}</h2>
                    {day.tripDay !== null && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Turdag {day.tripDay}
                      </span>
                    )}
                    {day.outsideTrip && (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        Utenfor turdatoene
                      </span>
                    )}
                  </div>
                </div>

                <ul className="mt-2 space-y-2">
                  {day.events.map((ev) => {
                    const isFocus = ev.id === focusId;
                    return (
                      <li key={ev.id}>
                        <div ref={isFocus ? focusRef : undefined}>
                          <button
                            onClick={() => {
                              setEditEvent(ev as AgendaEvent);
                              setDialogOpen(true);
                            }}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                              ev.status === "past" ? "border-border/60 bg-muted/20 opacity-60" : "border-border bg-muted/40",
                              isFocus && ev.status !== "past" && "border-primary/50 bg-primary/5",
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn("mt-1 h-9 w-1 shrink-0 rounded-full", colorMap[ev.color ?? "primary"] ?? colorMap.primary)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                                <Clock size={11} />
                                {formatZonedTime(ev.start_at, tz)} – {formatZonedTime(ev.end_at, tz)}
                                {ev.status === "ongoing" && (
                                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">
                                    Pågår
                                  </span>
                                )}
                                {isFocus && ev.status === "upcoming" && (
                                  <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    Neste
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 block truncate font-heading text-sm font-semibold text-foreground">
                                {ev.title}
                              </span>
                              {ev.description && (
                                <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground line-clamp-2">
                                  {ev.description}
                                </span>
                              )}
                            </span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <AgendaEventDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditEvent(null);
        }}
        onSave={async (title, desc, startAt, endAt, color) => {
          if (editEvent) {
            await updateEvent(editEvent.id, {
              title,
              description: desc || null,
              start_at: startAt.toISOString(),
              end_at: endAt.toISOString(),
              color,
            });
          } else {
            await createEvent(title, desc, startAt, endAt, color);
          }
        }}
        onDelete={editEvent && !isArchive ? () => deleteEvent(editEvent.id) : undefined}
        initialDate={editEvent ? new Date(editEvent.start_at) : new Date()}
        initialHour={new Date().getHours()}
        editEvent={editEvent}
        readOnly={isArchive}
      />

      {!isArchive && (
        <button
          onClick={openNew}
          className="fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition-transform"
          style={{ bottom: "calc(var(--bottom-nav-h-effective) + 16px)" }}
          aria-label="Legg til aktivitet"
        >
          <Plus size={24} />
        </button>
      )}

      <div style={{ paddingBottom: "var(--bottom-nav-h-effective)" }} />
    </div>
  );
};

export default AgendaScreen;
