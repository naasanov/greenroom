"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_SEMITONES,
  MIN_SEMITONES,
} from "@/components/audio-player/use-playback-settings";

const RATES = [
  0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.1, 1.25, 1.5, 1.75, 2,
];

function nearestIndex(rate: number): number {
  let best = 0;
  for (let i = 1; i < RATES.length; i++) {
    if (Math.abs(RATES[i]! - rate) < Math.abs(RATES[best]! - rate)) best = i;
  }
  return best;
}

function Stepper(props: {
  label: string;
  readout: string;
  decLabel: string;
  incLabel: string;
  resetLabel: string;
  decDisabled: boolean;
  incDisabled: boolean;
  onDec(): void;
  onInc(): void;
  onReset(): void;
  testId: string;
}) {
  return (
    <div
      role="group"
      aria-label={props.label}
      className="flex items-center gap-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10 hover:text-white"
        aria-label={props.decLabel}
        disabled={props.decDisabled}
        onClick={props.onDec}
      >
        <Minus />
      </Button>
      <button
        type="button"
        aria-label={props.resetLabel}
        data-testid={props.testId}
        onClick={props.onReset}
        className="h-11 min-w-14 rounded-lg px-1 text-center text-sm font-medium text-white tabular-nums hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {props.readout}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-white hover:bg-white/10 hover:text-white"
        aria-label={props.incLabel}
        disabled={props.incDisabled}
        onClick={props.onInc}
      >
        <Plus />
      </Button>
    </div>
  );
}

export function SpeedPitch(props: {
  rate: number;
  semitones: number;
  onRateChange(r: number): void;
  onSemitonesChange(n: number): void;
}) {
  const idx = nearestIndex(props.rate);
  const st = props.semitones;
  return (
    <div
      data-testid="speed-pitch"
      className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"
    >
      <Stepper
        label="Speed"
        readout={`${props.rate}x`}
        decLabel="Slower"
        incLabel="Faster"
        resetLabel="Reset speed"
        decDisabled={idx === 0 && props.rate <= RATES[0]!}
        incDisabled={idx === RATES.length - 1 && props.rate >= RATES[idx]!}
        onDec={() => {
          const cur = RATES[idx]!;
          const target = props.rate > cur ? idx : Math.max(0, idx - 1);
          props.onRateChange(RATES[target]!);
        }}
        onInc={() => {
          const cur = RATES[idx]!;
          const target =
            props.rate < cur ? idx : Math.min(RATES.length - 1, idx + 1);
          props.onRateChange(RATES[target]!);
        }}
        onReset={() => props.onRateChange(1)}
        testId="speed-readout"
      />
      <Stepper
        label="Transpose"
        readout={`${st > 0 ? "+" : ""}${st} st`}
        decLabel="Transpose down"
        incLabel="Transpose up"
        resetLabel="Reset transpose"
        decDisabled={st <= MIN_SEMITONES}
        incDisabled={st >= MAX_SEMITONES}
        onDec={() => props.onSemitonesChange(Math.max(MIN_SEMITONES, st - 1))}
        onInc={() => props.onSemitonesChange(Math.min(MAX_SEMITONES, st + 1))}
        onReset={() => props.onSemitonesChange(0)}
        testId="transpose-readout"
      />
    </div>
  );
}
