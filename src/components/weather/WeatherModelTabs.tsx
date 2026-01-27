import * as React from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { DavosPill } from "@/components/ui/davos-pill";
import { WEATHER_MODELS } from "@/services/weather.service";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

export type ModelSelection = "consensus" | typeof WEATHER_MODELS[number]["name"];

interface WeatherModelTabsProps {
  selected: ModelSelection;
  onSelect: (model: ModelSelection) => void;
}

const MODEL_INFO: Record<string, string> = {
  "consensus": "Appens sammenslåing av modellene",
  "ECMWF": "European Centre for Medium-Range Weather Forecasts (IFS)",
  "GFS": "NOAA (USA)",
  "ICON": "DWD (Tyskland)",
  "GEM": "ECCC (Canada)"
};

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
        <div className="flex items-center gap-2 px-4">
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
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1 text-xs">
                  {Object.entries(MODEL_INFO).map(([key, desc]) => (
                    <p key={key}>
                      <span className="font-semibold">{key === "consensus" ? "Konsensus" : key}:</span>{" "}
                      {desc}
                    </p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};
