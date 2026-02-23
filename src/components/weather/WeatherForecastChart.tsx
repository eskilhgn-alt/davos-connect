/**
 * WeatherForecastChart — 7-day overview + 24h detail on tap
 * Uses recharts for temperature curve, snow/precip bars, and wind line
 */
import * as React from "react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Wind, Snowflake, Droplets, Thermometer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeatherDaily, WeatherHourly } from "@/services/weather-dual.service";

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return "I dag";
  if (index === 1) return "I morgen";
  const d = new Date(dateStr);
  return d.toLocaleDateString("no-NO", { weekday: "short" }).replace(".", "");
}

// ============================================
// 7-DAY OVERVIEW CHART
// ============================================

interface OverviewProps {
  daily: WeatherDaily[];
  onDayTap: (index: number) => void;
}

const WeatherOverviewChart: React.FC<OverviewProps> = ({ daily, onDayTap }) => {
  const chartData = daily.map((d, i) => ({
    name: dayLabel(d.date, i),
    idx: i,
    tempMax: d.tempMax,
    tempMin: d.tempMin,
    snow: d.snow,
    precip: d.precip,
    wind: d.wind,
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
          onClick={(e) => {
            if (e?.activeTooltipIndex != null) onDayTap(e.activeTooltipIndex);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="temp"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}°`}
          />
          <YAxis
            yAxisId="precip"
            orientation="right"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}`}
            domain={[0, "auto"]}
            hide
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              fontSize: 12,
              color: "hsl(var(--foreground))",
            }}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                tempMax: "Maks",
                tempMin: "Min",
                snow: "Snø",
                precip: "Nedbør",
                wind: "Vind",
              };
              const units: Record<string, string> = {
                tempMax: "°C",
                tempMin: "°C",
                snow: " cm",
                precip: " mm",
                wind: " m/s",
              };
              return [`${value}${units[name] || ""}`, labels[name] || name];
            }}
          />

          {/* Snow bars */}
          <Bar
            yAxisId="precip"
            dataKey="snow"
            fill="hsl(var(--primary) / 0.4)"
            radius={[4, 4, 0, 0]}
            barSize={16}
          />

          {/* Precip bars (behind snow) */}
          <Bar
            yAxisId="precip"
            dataKey="precip"
            fill="hsl(var(--muted-foreground) / 0.2)"
            radius={[4, 4, 0, 0]}
            barSize={16}
          />

          {/* Temperature range area */}
          <Area
            yAxisId="temp"
            dataKey="tempMin"
            stroke="none"
            fill="none"
          />

          {/* Temp max line */}
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="tempMax"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--foreground))" }}
            activeDot={{ r: 5 }}
          />

          {/* Temp min line */}
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="tempMin"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={{ r: 2.5, fill: "hsl(var(--muted-foreground))" }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-foreground rounded-full inline-block" /> Maks °C
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-muted-foreground rounded-full inline-block border-dashed" /> Min °C
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary/40 inline-block" /> Snø
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/20 inline-block" /> Nedbør
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-2">
        Trykk på en dag for timebasert detalj
      </p>
    </div>
  );
};

// ============================================
// 24-HOUR DETAIL CHART (Sheet)
// ============================================

interface HourlyDetailProps {
  hourly: WeatherHourly[];
  dayDate: string;
  dayIndex: number;
  open: boolean;
  onClose: () => void;
}

const HourlyDetailChart: React.FC<HourlyDetailProps> = ({
  hourly,
  dayDate,
  dayIndex,
  open,
  onClose,
}) => {
  // Filter hourly data for the selected day
  const dayHours = hourly.filter((h) => h.time.startsWith(dayDate));

  const chartData = dayHours.map((h) => ({
    time: new Date(h.time).getHours().toString().padStart(2, "0"),
    temp: h.temp,
    wind: h.wind,
    precip: h.precip,
  }));

  const label = dayLabel(dayDate, dayIndex);
  const dateFormatted = new Date(dayDate).toLocaleDateString("no-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-base">
            {label} – {dateFormatted}
          </SheetTitle>
        </SheetHeader>

        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Ingen timedata tilgjengelig for denne dagen
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Temperature + Precip chart */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <Thermometer size={12} /> Temperatur & nedbør
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis
                    yAxisId="temp"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}°`}
                  />
                  <YAxis yAxisId="precip" orientation="right" hide domain={[0, "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 11,
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "temp") return [`${value}°C`, "Temp"];
                      if (name === "precip") return [`${value} mm`, "Nedbør"];
                      return [value, name];
                    }}
                    labelFormatter={(l) => `kl ${l}:00`}
                  />
                  <Bar
                    yAxisId="precip"
                    dataKey="precip"
                    fill="hsl(var(--primary) / 0.35)"
                    radius={[3, 3, 0, 0]}
                    barSize={10}
                  />
                  <Line
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temp"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={2}
                    dot={{ r: 2, fill: "hsl(var(--foreground))" }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Wind chart */}
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wind size={12} /> Vind (m/s)
              </p>
              <ResponsiveContainer width="100%" height={100}>
                <ComposedChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 11,
                      color: "hsl(var(--foreground))",
                    }}
                    formatter={(value: number) => [`${value} m/s`, "Vind"]}
                    labelFormatter={(l) => `kl ${l}:00`}
                  />
                  <Area
                    type="monotone"
                    dataKey="wind"
                    stroke="hsl(var(--muted-foreground))"
                    fill="hsl(var(--muted-foreground) / 0.15)"
                    strokeWidth={1.5}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Quick stats */}
            <div className="flex gap-2 text-xs pb-4">
              <div className="flex-1 p-3 rounded-xl bg-muted/30 border border-border text-center">
                <Thermometer size={14} className="mx-auto text-foreground mb-1" />
                <p className="font-semibold text-foreground">
                  {Math.max(...chartData.map((d) => d.temp))}° / {Math.min(...chartData.map((d) => d.temp))}°
                </p>
                <p className="text-muted-foreground">Maks / min</p>
              </div>
              <div className="flex-1 p-3 rounded-xl bg-muted/30 border border-border text-center">
                <Droplets size={14} className="mx-auto text-primary mb-1" />
                <p className="font-semibold text-foreground">
                  {chartData.reduce((s, d) => s + d.precip, 0).toFixed(1)} mm
                </p>
                <p className="text-muted-foreground">Total nedbør</p>
              </div>
              <div className="flex-1 p-3 rounded-xl bg-muted/30 border border-border text-center">
                <Wind size={14} className="mx-auto text-muted-foreground mb-1" />
                <p className="font-semibold text-foreground">
                  {Math.max(...chartData.map((d) => d.wind))} m/s
                </p>
                <p className="text-muted-foreground">Maks vind</p>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

// ============================================
// MAIN EXPORT
// ============================================

interface WeatherForecastChartProps {
  daily: WeatherDaily[];
  hourly: WeatherHourly[];
  loading?: boolean;
}

export const WeatherForecastChart: React.FC<WeatherForecastChartProps> = ({
  daily,
  hourly,
  loading,
}) => {
  const [selectedDay, setSelectedDay] = React.useState<number | null>(null);

  if (loading || daily.length === 0) return null;

  return (
    <section className="mt-4 px-4">
      <h2 className="font-heading text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
        <Thermometer className="h-4 w-4 text-primary" />
        Værprofil – uke
      </h2>
      <DavosCard>
        <DavosCardContent className="p-3 pt-4">
          <WeatherOverviewChart daily={daily} onDayTap={setSelectedDay} />
        </DavosCardContent>
      </DavosCard>

      {/* Hourly detail sheet */}
      {selectedDay !== null && daily[selectedDay] && (
        <HourlyDetailChart
          hourly={hourly}
          dayDate={daily[selectedDay].date}
          dayIndex={selectedDay}
          open={selectedDay !== null}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </section>
  );
};
