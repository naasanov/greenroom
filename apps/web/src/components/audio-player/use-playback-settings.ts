"use client";

import { useCallback, useState } from "react";

export const MIN_RATE = 0.5;
export const MAX_RATE = 2;
export const MIN_SEMITONES = -6;
export const MAX_SEMITONES = 6;

interface Settings {
  rate: number;
  semitones: number;
}

const DEFAULTS: Settings = { rate: 1, semitones: 0 };

function clampRate(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(MAX_RATE, Math.max(MIN_RATE, v))
    : DEFAULTS.rate;
}

function clampSemitones(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(MAX_SEMITONES, Math.max(MIN_SEMITONES, Math.round(v)))
    : DEFAULTS.semitones;
}

function keyFor(bandId: string, fileId: string): string {
  return `greenroom:audio-settings:${bandId}:${fileId}`;
}

function read(key: string): Settings {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings> | null;
    return {
      rate: clampRate(parsed?.rate),
      semitones: clampSemitones(parsed?.semitones),
    };
  } catch {
    return DEFAULTS;
  }
}

function write(key: string, settings: Settings) {
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // Storage can be blocked; settings then last for this page load only.
  }
}

/** Per recording, per browser speed and transpose, persisted in localStorage. */
export function usePlaybackSettings(bandId: string, fileId: string) {
  const key = keyFor(bandId, fileId);
  const [state, setState] = useState<{ key: string; settings: Settings }>(
    () => ({ key, settings: read(key) }),
  );

  // A different recording re-reads its own settings, so none leak between files.
  const settings = state.key === key ? state.settings : read(key);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...read(key), ...patch };
      write(key, next);
      setState({ key, settings: next });
    },
    [key],
  );

  const setRate = useCallback(
    (r: number) => update({ rate: clampRate(r) }),
    [update],
  );
  const setSemitones = useCallback(
    (n: number) => update({ semitones: clampSemitones(n) }),
    [update],
  );

  return {
    rate: settings.rate,
    semitones: settings.semitones,
    setRate,
    setSemitones,
  };
}
