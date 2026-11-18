"use client";

import { useCallback, useState } from "react";
import type { ChordsTheme } from "./chord-sheet-view";

export const FONT_MIN = 12;
export const FONT_MAX = 48;

interface GlobalPrefs {
  fontSize: number;
  lyricsOnly: boolean;
  theme: ChordsTheme;
}
interface SongPrefs {
  transpose: number;
  capo: number;
  /** Auto-scroll speed multiplier. */
  speed: number;
}

const GLOBAL_KEY = "greenroom:chords:prefs";
const songKey = (songId: string) => `greenroom:chords:song:${songId}`;

const GLOBAL_DEFAULTS: GlobalPrefs = {
  fontSize: 20,
  lyricsOnly: false,
  theme: "dark",
};
const SONG_DEFAULTS: SongPrefs = { transpose: 0, capo: 0, speed: 1 };

function read<T extends object>(key: string, defaults: T): T {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<T>) } : defaults;
  } catch {
    return defaults;
  }
}

function write(key: string, value: object) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: preferences stay in memory only.
  }
}

export const clampFont = (n: number) =>
  Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)));

/** Folds any semitone count into -5..6 so it stays a valid band transpose. */
export function foldSemitones(n: number): number {
  const m = ((n % 12) + 12) % 12;
  return m > 6 ? m - 12 : m;
}

/** Per-device reader preferences: global display settings plus per-song transpose, capo and speed. */
export function useReaderPrefs(songId: string) {
  const [global, setGlobal] = useState<GlobalPrefs>(() =>
    read(GLOBAL_KEY, GLOBAL_DEFAULTS),
  );
  const [songState, setSongState] = useState(() => ({
    id: songId,
    prefs: read(songKey(songId), SONG_DEFAULTS),
  }));
  if (songState.id !== songId) {
    setSongState({ id: songId, prefs: read(songKey(songId), SONG_DEFAULTS) });
  }
  const song = songState.prefs;

  const patchGlobal = useCallback((patch: Partial<GlobalPrefs>) => {
    setGlobal((prev) => {
      const next = { ...prev, ...patch };
      write(GLOBAL_KEY, next);
      return next;
    });
  }, []);

  const patchSong = useCallback(
    (patch: Partial<SongPrefs>) => {
      setSongState((prev) => {
        if (prev.id !== songId) return prev;
        const next = { ...prev.prefs, ...patch };
        write(songKey(songId), next);
        return { id: songId, prefs: next };
      });
    },
    [songId],
  );

  return {
    fontSize: global.fontSize,
    lyricsOnly: global.lyricsOnly,
    theme: global.theme,
    setFontSize: (n: number) => patchGlobal({ fontSize: clampFont(n) }),
    setLyricsOnly: (v: boolean) => patchGlobal({ lyricsOnly: v }),
    setTheme: (t: ChordsTheme) => patchGlobal({ theme: t }),
    transpose: song.transpose,
    capo: song.capo,
    speed: song.speed,
    setTranspose: (n: number) => patchSong({ transpose: foldSemitones(n) }),
    setCapo: (n: number) => patchSong({ capo: Math.min(11, Math.max(0, n)) }),
    setSpeed: (n: number) => patchSong({ speed: n }),
    resetTranspose: () => patchSong({ transpose: 0 }),
  };
}
