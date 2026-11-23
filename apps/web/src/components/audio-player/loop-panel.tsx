"use client";

import { Repeat, X } from "lucide-react";
import { endOptions, type LoopPoint } from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function LoopPanel(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  points: LoopPoint[];
  startId: string;
  endId: string;
  onChange(range: { startId: string; endId: string }): void;
}) {
  const { points, startId, endId, onChange } = props;

  if (!props.open) {
    return (
      <Button
        type="button"
        data-testid="loop-fab"
        aria-expanded={false}
        onClick={() => props.onOpenChange(true)}
        className="absolute right-4 bottom-4 z-10 h-12 rounded-full px-5 shadow-lg"
      >
        <Repeat />
        Loop
      </Button>
    );
  }

  const label = (id: string) => points.find((p) => p.id === id)?.label ?? "";
  const ends = endOptions(points, startId);
  // Trigger text stays on a dark surface regardless of the app theme.
  const triggerClass =
    "w-full border-white/25 bg-white/10 text-white hover:bg-white/15 dark:bg-white/10";

  function changeStart(id: string) {
    const nextEnds = endOptions(points, id);
    const keep = nextEnds.some((p) => p.id === endId);
    onChange({ startId: id, endId: keep ? endId : (nextEnds[0]?.id ?? endId) });
  }

  return (
    <div
      data-testid="loop-panel"
      role="group"
      aria-label="Loop"
      className="absolute right-4 bottom-4 z-10 w-[min(20rem,calc(100%-2rem))] rounded-2xl border border-white/15 bg-neutral-900 p-3 text-white shadow-xl"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Repeat className="size-4 shrink-0" />
          <span className="truncate">
            Looping {label(startId)} to {label(endId)}
          </span>
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Stop looping"
          className="-mt-1 -mr-1 shrink-0 text-white hover:bg-white/10 hover:text-white"
          onClick={() => props.onOpenChange(false)}
        >
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={startId} onValueChange={changeStart}>
          <SelectTrigger
            aria-label="Loop start"
            data-testid="loop-start"
            className={triggerClass}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[70]">
            {points
              .filter((p) => endOptions(points, p.id).length > 0)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={endId}
          onValueChange={(id) => onChange({ startId, endId: id })}
        >
          <SelectTrigger
            aria-label="Loop end"
            data-testid="loop-end"
            className={triggerClass}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="z-[70]">
            {ends.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
