"use client";

import { ArrowLeft, X } from "lucide-react";
import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { EVENT_TYPES, type EventType } from "@/components/app/event-types";
import { cn } from "@/lib/utils";

export type SplitView = "split" | "left" | "right";

export interface SplitSide {
  label: string;
  /** Shown under the label on the split view. */
  hint?: string;
  icon?: ReactNode;
  /** Colour family for the half; defaults to neutral. */
  tone?: EventType | "neutral";
  /** Header title once this side is open; defaults to the label. */
  title?: string;
  content: ReactNode;
}

const TONES = {
  neutral: "bg-muted/60 text-foreground active:bg-muted",
  gig: `${EVENT_TYPES.gig.soft} active:brightness-95`,
  practice: `${EVENT_TYPES.practice.soft} active:brightness-95`,
} as const;

const SWIPE_DISTANCE = 72;

/**
 * Bottom drawer whose first view is cut in half. Tapping a half slides to that
 * side's content; the back arrow or a swipe toward the split returns.
 */
export function SplitDrawer({
  open,
  onOpenChange,
  title,
  description,
  left,
  right,
  view: viewProp,
  onViewChange,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  left: SplitSide;
  right: SplitSide;
  view?: SplitView;
  onViewChange?: (view: SplitView) => void;
  className?: string;
}) {
  const [innerView, setInnerView] = useState<SplitView>("split");
  const view = viewProp ?? innerView;
  const setView = (next: SplitView) => {
    setInnerView(next);
    onViewChange?.(next);
  };

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const active = view === "left" ? left : view === "right" ? right : null;

  // Swiping toward the split: right-ward from the right side, left-ward from the left.
  function clamp(dx: number) {
    return view === "left" ? Math.min(0, dx) : Math.max(0, dx);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (view === "split") return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!dragging) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDragX(clamp(dx));
  }
  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    const s = start.current;
    start.current = null;
    if (!s || !dragging) return;
    setDragging(false);
    const dx = clamp(e.clientX - s.x);
    setDragX(0);
    if (Math.abs(dx) > SWIPE_DISTANCE) setView("split");
  }

  const index = view === "left" ? 0 : view === "split" ? 1 : 2;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) setView("split");
        onOpenChange(next);
      }}
    >
      <DrawerContent
        onPointerDownOutside={() => onOpenChange(false)}
        className={cn(
          "mx-auto h-[min(34rem,88dvh)] w-full max-w-lg data-[vaul-drawer-direction=bottom]:mt-12 data-[vaul-drawer-direction=bottom]:max-h-[90dvh] data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:shadow-lift",
          className,
        )}
      >
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">
          {description ?? "Choose an option to continue"}
        </DrawerDescription>

        <div className="relative flex h-14 shrink-0 items-center justify-center px-14">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back"
            data-testid="split-back"
            tabIndex={view === "split" ? -1 : 0}
            onClick={() => setView("split")}
            className={cn(
              "absolute left-2 transition-opacity",
              view === "split" && "pointer-events-none opacity-0",
            )}
          >
            <ArrowLeft />
          </Button>
          <p className="truncate text-base font-semibold" aria-hidden="true">
            {active ? (active.title ?? active.label) : title}
          </p>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close"
            className="absolute right-2 text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X />
          </Button>
        </div>

        <div
          className="relative min-h-0 flex-1 overflow-hidden"
          data-testid="split-viewport"
          data-view={view}
        >
          <div
            className={cn(
              "flex h-full w-[300%]",
              !dragging &&
                "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            )}
            style={{
              transform: `translateX(calc(${-index * (100 / 3)}% + ${dragX}px))`,
              touchAction: "pan-y",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            <section
              aria-label={left.label}
              inert={view !== "left"}
              data-testid="split-left"
              className="h-full w-1/3 overflow-y-auto overscroll-contain px-5 pb-safe"
            >
              {left.content}
            </section>

            <section
              aria-label="Choose"
              inert={view !== "split"}
              data-testid="split-choose"
              className="flex h-full w-1/3"
            >
              {(
                [
                  ["left", left],
                  ["right", right],
                ] as const
              ).map(([side, cfg]) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setView(side)}
                  data-testid={`split-pick-${side}`}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-3 px-3 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50",
                    TONES[cfg.tone ?? "neutral"],
                    side === "left"
                      ? "border-r border-background/60"
                      : "border-l border-background/60",
                  )}
                >
                  {cfg.icon ? (
                    <span className="flex size-16 items-center justify-center rounded-3xl bg-background/60 [&_svg]:size-8">
                      {cfg.icon}
                    </span>
                  ) : null}
                  <span className="text-xl font-semibold">{cfg.label}</span>
                  {cfg.hint ? (
                    <span className="max-w-32 text-sm opacity-75">
                      {cfg.hint}
                    </span>
                  ) : null}
                </button>
              ))}
            </section>

            <section
              aria-label={right.label}
              inert={view !== "right"}
              data-testid="split-right"
              className="h-full w-1/3 overflow-y-auto overscroll-contain px-5 pb-safe"
            >
              {right.content}
            </section>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
