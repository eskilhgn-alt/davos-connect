import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption {
  value: string;
  label: string;
}

export interface DavosSegmentedProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const DavosSegmented: React.FC<DavosSegmentedProps> = ({
  options,
  value,
  onChange,
  className,
}) => {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 p-1 bg-muted rounded-lg",
        className
      )}
      role="tablist"
    >
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 h-11 min-w-[80px] px-4 rounded-md font-heading font-semibold text-sm transition-all duration-200",
              "tap-target focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
