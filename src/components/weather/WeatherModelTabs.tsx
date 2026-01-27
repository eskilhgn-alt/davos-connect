import * as React from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DavosPill } from "@/components/ui/davos-pill";
import { WEATHER_MODELS } from "@/services/weather.service";

export type ModelSelection = "consensus" | typeof WEATHER_MODELS[number]["name"];

interface WeatherModelTabsProps {
  selected: ModelSelection;
  onSelect: (model: ModelSelection) => void;
}

export const WeatherModelTabs: React.FC<WeatherModelTabsProps> = ({
  selected,
  onSelect
}) => {
  const tabs: { id: ModelSelection; label: string }[] = [
    { id: "consensus", label: "Konsensus" },
    ...WEATHER_MODELS.map(m => ({ id: m.name as ModelSelection, label: m.name }))
  ];

  return (
    <div className="py-2">
      <ScrollArea className="w-full">
        <div className="flex gap-2 px-4">
          {tabs.map(tab => (
            <DavosPill
              key={tab.id}
              variant={selected === tab.id ? "primary" : "outline"}
              size="sm"
              onClick={() => onSelect(tab.id)}
              className="cursor-pointer whitespace-nowrap"
            >
              {tab.label}
            </DavosPill>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};
