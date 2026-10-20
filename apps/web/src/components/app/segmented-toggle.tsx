"use client";

import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Hide the text and keep it for screen readers (density toggles). */
  iconOnly?: boolean;
}

/** Single-select pill toggle (Month/Week, density). Never deselects. */
export function SegmentedToggle<T extends string>({
  value,
  onValueChange,
  options,
  label,
  fullWidth,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  fullWidth?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      spacing={0}
      className={cn(
        "gap-1 rounded-2xl bg-muted p-1",
        fullWidth && "w-full",
        className,
      )}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          aria-label={o.iconOnly ? o.label : undefined}
          className={cn(
            "h-9 min-w-11 flex-1 rounded-xl! px-3.5 text-muted-foreground hover:bg-transparent data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-soft",
          )}
        >
          {o.icon}
          {o.iconOnly ? null : o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
