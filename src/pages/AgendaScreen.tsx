/**
 * AgendaScreen – Shared weekly calendar (Outlook-inspired, KISS)
 */
import * as React from "react";
import { format, addDays, isSameDay } from "date-fns";
import { nb } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useAgenda, type AgendaEvent } from "@/hooks/useAgenda";
import { AgendaEventDialog } from "@/components/agenda/AgendaEventDialog";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 56; // px per hour row
const FOCUS_HOUR = 8; // auto-scroll to 08:00
const DAYS_IN_WEEK = 7;

const colorMap: Record<string, string> = {
  primary: "bg-primary/80 text-primary-foreground",
  destructive: "bg-destructive/80 text-destructive-foreground",
  accent: "bg-accent text-accent-foreground",
  yellow: "bg-[hsl(var(--davos-yellow))]/80 text-foreground",
};

export const AgendaScreen: React.FC = () => {
  const { events, weekStart, weekOffset, setWeekOffset, createEvent, updateEvent, deleteEvent } = useAgenda();
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = React.useState<number>(12);
  const [editEvent, setEditEvent] = React.useState<AgendaEvent | null>(null);

  // Long-press
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll to 08:00 on mount / week change
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = FOCUS_HOUR * HOUR_HEIGHT;
    }
  }, [weekOffset]);

  const days = React.useMemo(
    () => Array.from({ length: DAYS_IN_WEEK }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const handleLongPressStart = (day: Date, hour: number) => {
    longPressTimer.current = setTimeout(() => {
      setSelectedDate(day);
      setSelectedHour(hour);
      setEditEvent(null);
      setDialogOpen(true);
    }, 400);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleEventTap = (ev: AgendaEvent) => {
    setEditEvent(ev);
    setSelectedDate(new Date(ev.start_at));
    setDialogOpen(true);
  };

  const getEventsForDayHour = (day: Date, hour: number) => {
    return events.filter((ev) => {
      const s = new Date(ev.start_at);
      return isSameDay(s, day) && s.getHours() === hour;
    });
  };

  const getEventSpan = (ev: AgendaEvent) => {
    const s = new Date(ev.start_at);
    const e = new Date(ev.end_at);
    const hours = Math.max(1, (e.getTime() - s.getTime()) / 3600000);
    return hours;
  };

  const isToday = (day: Date) => isSameDay(day, new Date());

  return (
    <div className="flex flex-col overflow-hidden bg-background" style={{ height: "var(--app-height)" }}>
      <AppHeader title="Agenda" />

      {/* Week navigation */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="p-2 rounded-lg hover:bg-muted active:scale-95 transition-all">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <span className="font-heading text-sm font-semibold">
            {format(weekStart, "d. MMM", { locale: nb })} – {format(addDays(weekStart, 6), "d. MMM yyyy", { locale: nb })}
          </span>
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="ml-2 text-xs text-primary underline">
              I dag
            </button>
          )}
        </div>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="p-2 rounded-lg hover:bg-muted active:scale-95 transition-all">
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Day headers */}
      <div className="flex border-b border-border" style={{ paddingLeft: 48 }}>
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className={cn(
              "flex-1 text-center py-1.5",
              isToday(day) && "bg-primary/5"
            )}
          >
            <span className="text-[10px] uppercase text-muted-foreground font-medium">
              {format(day, "EEE", { locale: nb })}
            </span>
            <div className={cn(
              "text-sm font-semibold leading-tight",
              isToday(day) && "text-primary"
            )}>
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid – scrollable */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
          {/* Hour labels + grid lines */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="absolute left-0 right-0 border-b border-border/40"
              style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              <span className="absolute left-1 top-0 text-[10px] text-muted-foreground font-mono w-10 text-right pr-1 leading-none" style={{ transform: "translateY(-5px)" }}>
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
          ))}

          {/* Day columns */}
          <div className="absolute inset-0" style={{ left: 48 }}>
            <div className="flex h-full">
              {days.map((day, dayIdx) => (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "flex-1 relative border-r border-border/20",
                    isToday(day) && "bg-primary/[0.02]"
                  )}
                >
                  {/* Touchable hour cells */}
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 cursor-pointer"
                      style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      onPointerDown={() => handleLongPressStart(day, hour)}
                      onPointerUp={handleLongPressEnd}
                      onPointerLeave={handleLongPressEnd}
                    >
                      {/* Events at this hour */}
                      {getEventsForDayHour(day, hour).map((ev) => {
                        const span = getEventSpan(ev);
                        return (
                          <div
                            key={ev.id}
                            className={cn(
                              "absolute left-0.5 right-0.5 rounded-md px-1 py-0.5 text-[10px] leading-tight overflow-hidden cursor-pointer z-10",
                              colorMap[ev.color ?? "primary"] ?? colorMap.primary
                            )}
                            style={{ top: 0, height: span * HOUR_HEIGHT - 2 }}
                            onClick={(e) => { e.stopPropagation(); handleEventTap(ev); }}
                          >
                            <div className="font-semibold truncate">{ev.title}</div>
                            {span >= 1.5 && ev.description && (
                              <div className="truncate opacity-80">{ev.description}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Event dialog */}
      <AgendaEventDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditEvent(null); }}
        onSave={async (title, desc, startAt, endAt, color) => {
          if (editEvent) {
            await updateEvent(editEvent.id, {
              title,
              description: desc,
              start_at: startAt.toISOString(),
              end_at: endAt.toISOString(),
              color,
            });
          } else {
            await createEvent(title, desc, startAt, endAt, color);
          }
        }}
        onDelete={editEvent ? () => deleteEvent(editEvent.id) : undefined}
        initialDate={selectedDate ?? undefined}
        initialHour={selectedHour}
        editEvent={editEvent}
      />

      {/* Bottom nav padding */}
      <div style={{ paddingBottom: "var(--bottom-nav-h-effective)" }} />
    </div>
  );
};

export default AgendaScreen;
