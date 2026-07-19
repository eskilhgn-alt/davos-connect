/**
 * SkiUserStatsSheet — Bottom sheet showing a single user's ski statistics
 */
import * as React from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { BrandAvatar } from "@/components/ui/brand-avatar";
import { Mountain, Gauge, Calendar, Trophy } from "lucide-react";
import { format } from "date-fns";
import { nb } from "date-fns/locale";

export interface SkiUserData {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  total_vertical: number;
  active_days: number;
  today_vertical: number;
  top_speed: number | null;
  daily_entries: {
    day_date: string;
    vertical_meters: number;
    max_speed_kmh: number | null;
  }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: SkiUserData | null;
}

const StatCell: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
}> = ({ icon, label, value }) => (
  <div className="flex flex-col items-center p-2.5 rounded-xl bg-muted/50 border border-border">
    <span className="text-muted-foreground mb-1">{icon}</span>
    <span className="text-sm font-bold tabular-nums leading-none text-foreground">
      {value}
    </span>
    <span className="text-[9px] text-muted-foreground mt-1">{label}</span>
  </div>
);

export const SkiUserStatsSheet: React.FC<Props> = ({ open, onClose, data }) => {
  if (!data) return null;

  const initials = data.display_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="pb-2">
          <div className="flex items-center gap-3">
            <BrandAvatar
              src={data.avatar_url || undefined}
              fallback={initials}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <DrawerTitle className="text-left">
                {data.display_name}
              </DrawerTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ski-statistikk
              </p>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-6 overflow-y-auto">
          {/* Summary */}
          <h3 className="font-heading text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Oversikt
          </h3>
          <div className="grid grid-cols-4 gap-2">
            <StatCell
              icon={<Mountain size={14} />}
              label="Totalt HM"
              value={`${Math.round(data.total_vertical)}m`}
            />
            <StatCell
              icon={<Mountain size={14} />}
              label="I dag"
              value={`${Math.round(data.today_vertical)}m`}
            />
            <StatCell
              icon={<Calendar size={14} />}
              label="Ski-dager"
              value={data.active_days}
            />
            <StatCell
              icon={<Gauge size={14} />}
              label="Toppfart"
              value={data.top_speed ? `${Math.round(data.top_speed)} km/t` : "–"}
            />
          </div>

          {/* Daily breakdown */}
          {data.daily_entries.length > 0 && (
            <>
              <h3 className="font-heading text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-4 mb-2 px-1">
                Daglig oversikt
              </h3>
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {data.daily_entries.map((entry) => {
                  const dateObj = new Date(entry.day_date + "T12:00:00");
                  const today = new Date().toISOString().slice(0, 10);
                  const label =
                    entry.day_date === today
                      ? "I dag"
                      : format(dateObj, "EEEE d. MMM", { locale: nb });

                  return (
                    <div
                      key={entry.day_date}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-sm text-foreground capitalize">
                        {label}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mountain size={11} />
                          <strong className="text-foreground">
                            {Math.round(entry.vertical_meters)}m
                          </strong>
                        </span>
                        {entry.max_speed_kmh && entry.max_speed_kmh > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Gauge size={11} />
                            <strong className="text-foreground">
                              {entry.max_speed_kmh.toFixed(1)} km/t
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {data.daily_entries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4 mt-4">
              Ingen skidata registrert ennå
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
