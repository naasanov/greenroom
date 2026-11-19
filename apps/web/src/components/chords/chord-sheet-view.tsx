"use client";

import { Fragment, memo, useMemo } from "react";
import {
  formatChord,
  transposeSheet,
  type PlacedChord,
  type SheetLine,
} from "@greenroom/shared";
import { cn } from "cn";

export type ChordsTheme = "dark" | "light";

interface Piece {
  text: string;
  chord: string | null;
}

/** Splits a lyric line into words, attaching each chord to the word it starts in. */
function toGroups(lyrics: string, chords: PlacedChord[]): Piece[][] {
  const sorted = [...chords].sort((a, b) => a.pos - b.pos);
  const pieces: Piece[] = [];
  const push = (text: string, chord: string | null) => {
    if (text || chord) pieces.push({ text, chord });
  };
  const words = (slice: string, firstChord: string | null) => {
    const parts = slice.match(/\s*\S+\s*|\s+/g) ?? [];
    if (parts.length === 0) return push("", firstChord);
    parts.forEach((p, i) => push(p, i === 0 ? firstChord : null));
  };
  if (sorted.length === 0 || sorted[0].pos > 0) {
    words(lyrics.slice(0, sorted[0]?.pos ?? lyrics.length), null);
  }
  sorted.forEach((c, i) => {
    const end = sorted[i + 1]?.pos ?? lyrics.length;
    words(
      lyrics.slice(Math.min(c.pos, lyrics.length), end),
      formatChord(c.chord),
    );
  });
  const groups: Piece[][] = [];
  let current: Piece[] = [];
  for (const p of pieces) {
    current.push(p);
    if (/\s$/.test(p.text) || p.text === "") {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function ChordedLine({
  lyrics,
  chords,
  theme,
}: {
  lyrics: string;
  chords: PlacedChord[];
  theme: ChordsTheme;
}) {
  const groups = useMemo(() => toGroups(lyrics, chords), [lyrics, chords]);
  return (
    <div className="break-inside-avoid leading-tight" data-testid="chords-line">
      {groups.map((group, gi) => (
        <span key={gi} className="inline-block whitespace-nowrap align-top">
          {group.map((p, pi) => (
            <span key={pi} className="inline-block align-top">
              <span
                className={cn(
                  "block min-h-[1.25em] pr-[0.6em] font-bold",
                  theme === "dark" ? "text-amber-300" : "text-blue-700",
                )}
              >
                {p.chord ?? " "}
              </span>
              <span className="block whitespace-pre">{p.text || " "}</span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

function ChordOnlyLine({
  chords,
  theme,
}: {
  chords: PlacedChord[];
  theme: ChordsTheme;
}) {
  const sorted = [...chords].sort((a, b) => a.pos - b.pos);
  return (
    <div
      className={cn(
        "flex break-inside-avoid flex-wrap gap-x-[1.4em] font-bold leading-snug",
        theme === "dark" ? "text-amber-300" : "text-blue-700",
      )}
    >
      {sorted.map((p, i) => (
        <span key={i}>{formatChord(p.chord)}</span>
      ))}
    </div>
  );
}

interface ChordSheetViewProps {
  sheet: { version: 1; lines: SheetLine[] };
  /** Semitones applied to every chord. */
  semitones: number;
  preferFlats?: boolean;
  fontSize: number;
  lyricsOnly: boolean;
  theme: ChordsTheme;
  twoColumns: boolean;
}

/** Renders a chord sheet with chords above the lyric fragment they belong to. */
export const ChordSheetView = memo(function ChordSheetView({
  sheet,
  semitones,
  preferFlats,
  fontSize,
  lyricsOnly,
  theme,
  twoColumns,
}: ChordSheetViewProps) {
  const shown = useMemo(
    () => transposeSheet(sheet, semitones, preferFlats),
    [sheet, semitones, preferFlats],
  );
  const size = lyricsOnly ? fontSize * 1.15 : fontSize;
  return (
    <div
      data-testid="chords-sheet"
      className={cn(
        "max-w-full break-words",
        twoColumns && "columns-2 gap-10",
        theme === "dark" ? "text-white" : "text-zinc-900",
      )}
      style={{ fontSize: size }}
    >
      {shown.lines.map((line, i) => {
        if (line.kind === "section") {
          return (
            <div
              key={i}
              data-section={i}
              data-testid="chords-section"
              className={cn(
                "mt-[1.1em] mb-[0.35em] inline-block break-inside-avoid break-after-avoid scroll-mt-24 rounded-md px-[0.6em] py-[0.1em] text-[0.7em] font-bold uppercase tracking-wider",
                theme === "dark"
                  ? "bg-white/15 text-white"
                  : "bg-zinc-900/10 text-zinc-900",
              )}
            >
              {line.label}
            </div>
          );
        }
        if (line.kind === "text") {
          return line.text === "" ? (
            <div key={i} className="h-[0.7em]" />
          ) : (
            <div
              key={i}
              className="break-inside-avoid whitespace-pre-wrap font-mono text-[0.85em] leading-snug opacity-80"
            >
              {line.text}
            </div>
          );
        }
        if (lyricsOnly) {
          return line.lyrics.trim() === "" ? null : (
            <div
              key={i}
              className="break-inside-avoid whitespace-pre-wrap leading-snug"
            >
              {line.lyrics}
            </div>
          );
        }
        return (
          <Fragment key={i}>
            {line.lyrics.trim() === "" ? (
              <ChordOnlyLine chords={line.chords} theme={theme} />
            ) : (
              <ChordedLine
                lyrics={line.lyrics}
                chords={line.chords}
                theme={theme}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
});
