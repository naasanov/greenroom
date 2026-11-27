"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MAX_SEMITONES,
  MIN_SEMITONES,
} from "@/components/audio-player/use-playback-settings";

export type SettingPanel = "speed" | "pitch";

const RATES = [
  0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.25, 1.5, 1.75, 2,
];
const GAP = 8;

function nearestIndex(rate: number): number {
  let best = 0;
  for (let i = 1; i < RATES.length; i++) {
    if (Math.abs(RATES[i]! - rate) < Math.abs(RATES[best]! - rate)) best = i;
  }
  return best;
}

const stepClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40";

function TriggerButton({
  ref,
  testId,
  label,
  open,
  muted,
  onClick,
}: {
  ref: React.Ref<HTMLButtonElement>;
  testId: string;
  label: string;
  open: boolean;
  muted: boolean;
  onClick(): void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-testid={testId}
      aria-haspopup="true"
      aria-expanded={open}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center rounded-lg border border-white/20 px-3 text-sm font-medium tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        open ? "bg-white/25 text-white" : "bg-white/10 hover:bg-white/15",
        !open && (muted ? "text-white/60" : "text-white"),
      )}
    >
      {label}
    </button>
  );
}

/** Small non-modal popover anchored to its trigger; flips above when it does not fit below. */
function Panel(props: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  label: string;
  testId: string;
  readoutId: string;
  readout: string;
  decLabel: string;
  incLabel: string;
  resetLabel: string;
  decDisabled: boolean;
  incDisabled: boolean;
  onDec(): void;
  onInc(): void;
  onReset(): void;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const { anchor, onClose } = props;

  useLayoutEffect(() => {
    const btn = anchor.current;
    const panel = ref.current;
    const parent = btn?.offsetParent;
    if (!btn || !panel || !(parent instanceof HTMLElement)) return;
    const rect = btn.getBoundingClientRect();
    const viewH = window.visualViewport?.height ?? window.innerHeight;
    const below = viewH - rect.bottom;
    const above = rect.top;
    const needed = panel.offsetHeight + GAP;
    const goBelow = below >= needed || below >= above;
    setPos({
      left: Math.max(
        0,
        Math.min(btn.offsetLeft, parent.clientWidth - panel.offsetWidth),
      ),
      top: goBelow
        ? btn.offsetTop + btn.offsetHeight + GAP
        : btn.offsetTop - needed,
    });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [anchor, onClose]);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={props.label}
      data-testid={props.testId}
      style={pos ?? { left: 0, top: 0, visibility: "hidden" }}
      className="absolute z-20 w-60 max-w-full rounded-2xl border border-white/15 bg-neutral-900 p-3 text-white shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label={props.decLabel}
          disabled={props.decDisabled}
          onClick={props.onDec}
          className={stepClass}
        >
          <Minus className="size-4" />
        </button>
        <p
          data-testid={props.readoutId}
          aria-live="polite"
          className="min-w-0 flex-1 text-center text-3xl font-semibold tabular-nums"
        >
          {props.readout}
        </p>
        <button
          type="button"
          aria-label={props.incLabel}
          disabled={props.incDisabled}
          onClick={props.onInc}
          className={stepClass}
        >
          <Plus className="size-4" />
        </button>
      </div>
      <button
        type="button"
        aria-label={props.resetLabel}
        onClick={props.onReset}
        className="mt-3 h-11 w-full rounded-lg border border-white/20 bg-white/10 text-sm font-medium outline-none hover:bg-white/20 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Reset
      </button>
    </div>
  );
}

/**
 * Speed and Pitch trigger buttons plus their popovers, rendered as flex items so
 * they share a row with sibling controls. The row must be a positioned ancestor.
 */
export function SpeedPitch(props: {
  open: SettingPanel | null;
  onOpenChange(next: SettingPanel | null): void;
  rate: number;
  semitones: number;
  onRateChange(r: number): void;
  onSemitonesChange(n: number): void;
}) {
  const { open, onOpenChange } = props;
  const speedRef = useRef<HTMLButtonElement>(null);
  const pitchRef = useRef<HTMLButtonElement>(null);
  const idx = nearestIndex(props.rate);
  const st = props.semitones;
  const close = () => onOpenChange(null);
  const toggle = (p: SettingPanel) => onOpenChange(open === p ? null : p);

  return (
    <>
      <TriggerButton
        ref={speedRef}
        testId="speed-button"
        label={`Speed ${props.rate}x`}
        open={open === "speed"}
        muted={props.rate === 1}
        onClick={() => toggle("speed")}
      />
      {open === "speed" ? (
        <Panel
          anchor={speedRef}
          label="Speed"
          testId="speed-panel"
          readoutId="speed-readout"
          readout={`${props.rate}x`}
          decLabel="Slower"
          incLabel="Faster"
          resetLabel="Reset speed"
          decDisabled={idx === 0 && props.rate <= RATES[0]!}
          incDisabled={idx === RATES.length - 1 && props.rate >= RATES[idx]!}
          onDec={() => {
            const target =
              props.rate > RATES[idx]! ? idx : Math.max(0, idx - 1);
            props.onRateChange(RATES[target]!);
          }}
          onInc={() => {
            const target =
              props.rate < RATES[idx]!
                ? idx
                : Math.min(RATES.length - 1, idx + 1);
            props.onRateChange(RATES[target]!);
          }}
          onReset={() => props.onRateChange(1)}
          onClose={close}
        />
      ) : null}
      <TriggerButton
        ref={pitchRef}
        testId="pitch-button"
        label={`Pitch ${st > 0 ? "+" : ""}${st}`}
        open={open === "pitch"}
        muted={st === 0}
        onClick={() => toggle("pitch")}
      />
      {open === "pitch" ? (
        <Panel
          anchor={pitchRef}
          label="Transpose"
          testId="pitch-panel"
          readoutId="transpose-readout"
          readout={`${st > 0 ? "+" : ""}${st} st`}
          decLabel="Transpose down"
          incLabel="Transpose up"
          resetLabel="Reset transpose"
          decDisabled={st <= MIN_SEMITONES}
          incDisabled={st >= MAX_SEMITONES}
          onDec={() => props.onSemitonesChange(Math.max(MIN_SEMITONES, st - 1))}
          onInc={() => props.onSemitonesChange(Math.min(MAX_SEMITONES, st + 1))}
          onReset={() => props.onSemitonesChange(0)}
          onClose={close}
        />
      ) : null}
    </>
  );
}
