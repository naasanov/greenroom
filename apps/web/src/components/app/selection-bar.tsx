"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Placement } from "@/components/app/event-types";
import { cn } from "@/lib/utils";

export interface SelectionAction {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** "any" (default) shows for every selection, "single" only for exactly one. */
  when?: "any" | "single";
  destructive?: boolean;
}

/**
 * Floating action bar shown whenever something is selected. Actions that need
 * a single item (rename) disappear for larger selections.
 */
export function SelectionBar({
  count,
  actions,
  onClear,
  noun = "selected",
  labels = true,
  placement = "fixed",
  className,
}: {
  count: number;
  actions: SelectionAction[];
  onClear: () => void;
  noun?: string;
  /** False keeps the buttons icon-only at every width (long action lists). */
  labels?: boolean;
  placement?: Placement;
  className?: string;
}) {
  const visible = count > 0;
  const shown = actions.filter((a) => a.when !== "single" || count === 1);
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      aria-hidden={!visible}
      inert={!visible}
      data-testid="selection-bar"
      data-visible={visible}
      className={cn(
        placement === "fixed" ? "fixed" : "absolute",
        "inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto flex max-w-lg items-center gap-1 rounded-3xl border bg-popover p-1.5 shadow-lift transition-all duration-200",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-6 opacity-0",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Clear selection"
        onClick={onClear}
      >
        <X />
      </Button>
      <p className="shrink-0 px-1 text-sm font-semibold">
        <span data-testid="selection-count">{count}</span> {noun}
      </p>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-x-auto">
        {shown.map((a) => (
          <Button
            key={a.key}
            variant={a.destructive ? "destructive" : "secondary"}
            onClick={a.onSelect}
            aria-label={a.label}
            className="shrink-0 px-3"
          >
            {a.icon}
            {labels ? (
              <span className="hidden sm:inline">{a.label}</span>
            ) : null}
          </Button>
        ))}
      </div>
    </div>
  );
}
