import { z } from "zod";

export interface ChordToken {
  root: string;
  suffix: string;
  bass?: string;
}
export interface PlacedChord {
  pos: number;
  chord: ChordToken;
}
export type SheetLine =
  | { kind: "section"; label: string }
  | { kind: "line"; lyrics: string; chords: PlacedChord[] }
  | { kind: "text"; text: string };
export interface ChordSheet {
  version: 1;
  lines: SheetLine[];
}

export type ChordSource = "ultimate-guitar" | "manual";
export interface SongChordSheet {
  songId: string;
  sheet: ChordSheet;
  source: ChordSource;
  sourceUrl: string | null;
  key: string | null;
  capo: number | null;
  tuning: string | null;
  bandTranspose: number;
  editedAt: string | null;
  importedAt: string | null;
  updatedAt: string;
}
export interface ChordsIndex {
  enabled: boolean;
  songIds: string[];
}
export interface UgVersion {
  url: string;
  songName: string;
  artistName: string;
  rating: number;
  votes: number;
}
export interface ChordsSuggestion {
  match: UgVersion | null;
  versions: UgVersion[];
}

export const CHORD_ERROR_CODES = {
  invalidLink: "UG_INVALID_LINK",
  official: "UG_OFFICIAL_NOT_SUPPORTED",
  failed: "UG_IMPORT_FAILED",
  noSheet: "NO_CHORD_SHEET",
} as const;

/** Ultimate Guitar hosts; the first gives a real favicon. */
export const UG_HOST_LIST = [
  "www.ultimate-guitar.com",
  "tabs.ultimate-guitar.com",
  "ultimate-guitar.com",
] as const;
const UG_HOSTS: ReadonlySet<string> = new Set(UG_HOST_LIST);

export function isUltimateGuitarUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return (
      (u.protocol === "https:" || u.protocol === "http:") &&
      u.port === "" &&
      !u.username &&
      !u.password &&
      UG_HOSTS.has(u.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export const chordsSuggestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artist: z.string().trim().max(200).nullish(),
});
export const chordsBulkSchema = z.object({
  songIds: z.array(z.string().uuid()).max(200),
});
export const chordsImportSchema = z.object({
  url: z
    .string()
    .trim()
    .refine(isUltimateGuitarUrl, "Must be an Ultimate Guitar link"),
});
export const chordsSaveSchema = z.object({ text: z.string().max(50000) });
export const chordsBandTransposeSchema = z.object({
  semitones: z.number().int().min(-11).max(11),
});

// ---- chord parsing and transposition ----

const CHORD_RE =
  /^([A-G][#b]?)((?:6\/9|maj|min|dim|aug|sus|add|m|M|\+|-|°|ø|\d+|[#b]\d+|\([^()\s]{1,6}\))*)(?:\/([A-G][#b]?))?$/;

export function parseChord(s: string): ChordToken | null {
  const m = CHORD_RE.exec(s.trim());
  if (!m || m[2].length > 14) return null;
  const chord: ChordToken = { root: m[1], suffix: m[2] };
  if (m[3]) chord.bass = m[3];
  return chord;
}

export function formatChord(c: ChordToken): string {
  return c.root + c.suffix + (c.bass ? `/${c.bass}` : "");
}

const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const NATURAL: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

function noteIndex(note: string): number {
  let n = NATURAL[note[0]];
  if (note[1] === "#") n += 1;
  else if (note[1] === "b") n -= 1;
  return (n + 12) % 12;
}

function shiftNote(note: string, semitones: number, flats: boolean): string {
  const i = (((noteIndex(note) + semitones) % 12) + 12) % 12;
  return (flats ? FLAT_NAMES : SHARP_NAMES)[i];
}

export function transposeChord(
  c: ChordToken,
  semitones: number,
  preferFlats?: boolean,
): ChordToken {
  if (semitones === 0) return c;
  const flats =
    preferFlats ?? (c.root.endsWith("b") || (c.bass?.endsWith("b") ?? false));
  const out: ChordToken = {
    root: shiftNote(c.root, semitones, flats),
    suffix: c.suffix,
  };
  if (c.bass) out.bass = shiftNote(c.bass, semitones, flats);
  return out;
}

export function transposeSheet(
  sheet: ChordSheet,
  semitones: number,
  preferFlats?: boolean,
): ChordSheet {
  if (semitones === 0) return sheet;
  return {
    version: 1,
    lines: sheet.lines.map((l) =>
      l.kind === "line"
        ? {
            ...l,
            chords: l.chords.map((p) => ({
              pos: p.pos,
              chord: transposeChord(p.chord, semitones, preferFlats),
            })),
          }
        : l,
    ),
  };
}

const FLAT_KEYS = new Set([
  "F",
  "Bb",
  "Eb",
  "Ab",
  "Db",
  "Gb",
  "Dm",
  "Gm",
  "Cm",
  "Fm",
  "Bbm",
  "Ebm",
]);

function parseKey(key: string): { root: string; minor: boolean } | null {
  const m = /^([A-G][#b]?)\s*(m(?!aj)|min)?/.exec(key.trim());
  return m ? { root: m[1], minor: !!m[2] } : null;
}

export function prefersFlats(key: string | null): boolean {
  if (!key) return false;
  const k = parseKey(key);
  return k ? FLAT_KEYS.has(k.root + (k.minor ? "m" : "")) : false;
}

export function transposeKey(key: string, semitones: number): string {
  const k = parseKey(key);
  if (!k) return key;
  const i = (((noteIndex(k.root) + semitones) % 12) + 12) % 12;
  const mark = k.minor ? "m" : "";
  const flat = FLAT_NAMES[i];
  return (FLAT_KEYS.has(flat + mark) ? flat : SHARP_NAMES[i]) + mark;
}

// ---- sheet parsing ----

type Item =
  | { t: "blank" }
  | { t: "section"; label: string }
  | { t: "text"; text: string }
  | { t: "chords"; chords: PlacedChord[] }
  | { t: "line"; lyrics: string; chords: PlacedChord[] };

const KNOWN_LABEL =
  /^(intro|verse|pre-chorus|chorus|bridge|solo|outro|interlude|instrumental|refrain|hook|coda|tag)(\s+\d+)?\s*:?$/i;

function sectionLabel(trimmed: string, allowWords: boolean): string | null {
  const b = /^\[([^\][]+)\]$/.exec(trimmed);
  if (b) return b[1].trim();
  if (allowWords && KNOWN_LABEL.test(trimmed))
    return trimmed.replace(/\s*:$/, "").trim();
  return null;
}

const CHORD_FILLER = /^(\||\|\||\(?x\d+\)?|-|%|N\.C\.)$/i;

function parseChordLine(line: string): PlacedChord[] | null {
  const chords: PlacedChord[] = [];
  for (const m of line.matchAll(/\S+/g)) {
    const chord = parseChord(m[0]);
    if (chord) chords.push({ pos: m.index, chord });
    else if (!CHORD_FILLER.test(m[0])) return null;
  }
  return chords.length ? chords : null;
}

function plainItem(raw: string): Item {
  const line = raw.trimEnd();
  const trimmed = line.trim();
  if (!trimmed) return { t: "blank" };
  const label = sectionLabel(trimmed, true);
  if (label !== null) return { t: "section", label };
  const chords = parseChordLine(line);
  if (chords) return { t: "chords", chords };
  return { t: "text", text: line };
}

const CH_TAG = /\[ch\](.*?)\[\/ch\]/gi;

function ugItem(raw: string): Item {
  const line = raw.replace(/\[\/?tab\]/gi, "").trimEnd();
  if (!/\[ch\]/i.test(line)) {
    const trimmed = line.trim();
    if (!trimmed) return { t: "blank" };
    const label = sectionLabel(trimmed, false);
    return label !== null ? { t: "section", label } : { t: "text", text: line };
  }
  let stripped = "";
  let lyrics = "";
  let last = 0;
  const cols: { col: number; lyricPos: number; text: string }[] = [];
  for (const m of line.matchAll(CH_TAG)) {
    const before = line.slice(last, m.index);
    stripped += before;
    lyrics += before;
    cols.push({
      col: stripped.length,
      lyricPos: lyrics.length,
      text: m[1].trim(),
    });
    stripped += m[1];
    last = m.index + m[0].length;
  }
  const tail = line.slice(last);
  stripped += tail;
  lyrics += tail;
  const parsed = cols.map((c) => ({ c, chord: parseChord(c.text) }));
  // Unparseable tokens (N.C., x2) are dropped; the line keeps its real chords.
  const good = parsed.flatMap((p) =>
    p.chord ? [{ c: p.c, chord: p.chord }] : [],
  );
  if (good.length === 0) return { t: "text", text: stripped.trimEnd() };
  if (!lyrics.trim()) {
    return {
      t: "chords",
      chords: good.map((p) => ({ pos: p.c.col, chord: p.chord })),
    };
  }
  return {
    t: "line",
    lyrics: lyrics.trimEnd(),
    chords: good.map((p) => ({ pos: p.c.lyricPos, chord: p.chord })),
  };
}

function assemble(items: Item[]): ChordSheet {
  const lines: SheetLine[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.t === "blank") lines.push({ kind: "text", text: "" });
    else if (it.t === "section")
      lines.push({ kind: "section", label: it.label });
    else if (it.t === "text") lines.push({ kind: "text", text: it.text });
    else if (it.t === "line")
      lines.push({ kind: "line", lyrics: it.lyrics, chords: it.chords });
    else {
      const next = items[i + 1];
      if (next && next.t === "text") {
        lines.push({ kind: "line", lyrics: next.text, chords: it.chords });
        i++;
      } else {
        lines.push({ kind: "line", lyrics: "", chords: it.chords });
      }
    }
  }
  return { version: 1, lines: normalizeBlanks(lines) };
}

const isBlank = (l: SheetLine) => l.kind === "text" && l.text === "";

function normalizeBlanks(lines: SheetLine[]): SheetLine[] {
  const out: SheetLine[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isBlank(lines[i])) {
      out.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && isBlank(lines[j])) j++;
    const run = j - i;
    if (out.length > 0 && j < lines.length)
      out.push(...lines.slice(i, run >= 3 ? i + 1 : j));
    i = j;
  }
  return out;
}

const splitLines = (s: string) => s.split(/\r\n|\r|\n/);

export function parseUgMarkup(content: string): ChordSheet {
  return assemble(splitLines(content).map(ugItem));
}

export function parsePlainText(text: string): ChordSheet {
  return assemble(splitLines(text).map(plainItem));
}

export function sheetToPlainText(sheet: ChordSheet): string {
  const out: string[] = [];
  for (const l of sheet.lines) {
    if (l.kind === "section") out.push(`[${l.label}]`);
    else if (l.kind === "text") out.push(l.text);
    else {
      if (l.chords.length) {
        let row = "";
        for (const p of [...l.chords].sort((a, b) => a.pos - b.pos)) {
          const col = Math.max(p.pos, row.length ? row.length + 1 : 0);
          row += " ".repeat(col - row.length) + formatChord(p.chord);
        }
        out.push(row);
      }
      if (l.lyrics || !l.chords.length) out.push(l.lyrics);
    }
  }
  return out.join("\n");
}

export function sheetSections(
  sheet: ChordSheet,
): { label: string; lineIndex: number }[] {
  const res: { label: string; lineIndex: number }[] = [];
  sheet.lines.forEach((l, lineIndex) => {
    if (l.kind === "section") res.push({ label: l.label, lineIndex });
  });
  return res;
}
