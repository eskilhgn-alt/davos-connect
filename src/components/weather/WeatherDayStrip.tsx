import * as React from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DavosSkeleton } from "@/components/ui/davos-skeleton";
import { WeatherDayCard } from "./WeatherDayCard";
import { type DayAggregate } from "@/services/weather.service";

interface WeatherDayStripProps {
  days: DayAggregate[];
  selectedIndex: number;
  onSelectDay: (index: number) => void;
  loading?: boolean;
}

export const WeatherDayStrip: React.FC<WeatherDayStripProps> = ({
  days,
  selectedIndex,
  onSelectDay,
  loading
}) => {
  if (loading) {
    return (
      <div className="px-4 py-3">
        <ScrollArea className="w-full">
          <div className="flex gap-2">
            {[...Array(7)].map((_, i) => (
              <DavosSkeleton
                key={i}
                className="min-w-[72px] h-[120px] rounded-xl"
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="py-3">
      <ScrollArea className="w-full">
        <div className="flex gap-2 px-4">
          {days.map((day, index) => (
            <WeatherDayCard
              key={day.date}
              day={day}
              selected={index === selectedIndex}
              onClick={() => onSelectDay(index)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};
