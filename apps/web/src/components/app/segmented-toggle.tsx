"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  const measure = useCallback(() => {
    const active =
      rootRef.current?.querySelector<HTMLElement>('[data-state="on"]');
    if (!active) return setPill(null);
    setPill((p) =>
      p && p.x === active.offsetLeft && p.w === active.offsetWidth
        ? p
        : { x: active.offsetLeft, w: active.offsetWidth },
    );
  }, []);

  // Measure before paint so the pill starts under the active item, not at 0.
  useLayoutEffect(measure, [measure, value, options.length]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    root.querySelectorAll("button").forEach((b) => ro.observe(b));
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure, options.length]);

  return (
    <ToggleGroup
      ref={rootRef}
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      spacing={0}
      className={cn(
        "relative gap-1 rounded-2xl bg-muted p-1",
        fullWidth && "w-full",
        className,
      )}
    >
      <span
        aria-hidden
        data-testid="segmented-indicator"
        className={cn(
          "pointer-events-none absolute top-1 bottom-1 left-0 rounded-xl bg-background shadow-soft",
          animate &&
            "transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        )}
        style={{
          width: pill?.w ?? 0,
          transform: `translateX(${pill?.x ?? 0}px)`,
          opacity: pill ? 1 : 0,
        }}
      />
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          aria-label={o.iconOnly ? o.label : undefined}
          className={cn(
            "relative h-9 min-w-11 flex-1 rounded-xl! px-3.5 text-muted-foreground transition-colors hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:text-foreground",
          )}
        >
          {o.icon}
          {o.iconOnly ? null : o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
