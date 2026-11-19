import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SUGGESTIBLE_REFERENCES,
  findMagicReference,
  validateMagicReferenceValue,
} from "./songs.js";
import {
  CHORD_ERROR_CODES,
  chordsImportSchema,
  formatChord,
  isUltimateGuitarUrl,
  parseChord,
  parsePlainText,
  parseUgMarkup,
  prefersFlats,
  sheetSections,
  sheetToPlainText,
  transposeChord,
  transposeKey,
  transposeSheet,
} from "./chords.js";

const UG_EXCERPT = [
  "Simplified version, A7sus4 x02033 is played",
  "",
  "",
  "[Intro]",
  "[ch]Em[/ch]   [ch]G[/ch]   [ch]D[/ch]   [ch]A7sus4[/ch]",
  "",
  "",
  "[Verse 1]",
  "[tab][ch]Em[/ch]       [ch]G[/ch]",
  "Today is gonna be the day[/tab]",
  "[tab]              [ch]D[/ch]                  [ch]A7sus4[/ch]",
  "That they're gonna throw it back to you[/tab]",
  "",
  "",
  "",
  "[Chorus]",
  "[tab]         [ch]C[/ch]    [ch]Em[/ch]  [ch]G[/ch]",
  "Because maybe[/tab]",
  "",
].join("\r\n");

test("parseChord edge cases", () => {
  assert.deepEqual(parseChord("F#m7/C#"), {
    root: "F#",
    suffix: "m7",
    bass: "C#",
  });
  assert.deepEqual(parseChord("Bbmaj7"), { root: "Bb", suffix: "maj7" });
  assert.deepEqual(parseChord("A7sus4"), { root: "A", suffix: "7sus4" });
  assert.deepEqual(parseChord("Dsus2/F#"), {
    root: "D",
    suffix: "sus2",
    bass: "F#",
  });
  assert.deepEqual(parseChord("Em7b5"), { root: "E", suffix: "m7b5" });
  assert.deepEqual(parseChord("C"), { root: "C", suffix: "" });
  for (const bad of ["", "H", "am", "Hello", "x2", "N.C.", "C/", "Cxyz", "|"]) {
    assert.equal(parseChord(bad), null, bad);
  }
  assert.equal(formatChord(parseChord("Cadd9/G")!), "Cadd9/G");
});

test("transposeChord spelling and bass", () => {
  const c = parseChord("F#m7/C#")!;
  assert.equal(formatChord(transposeChord(c, 1)), "Gm7/D");
  assert.equal(formatChord(transposeChord(parseChord("C")!, 1)), "C#");
  assert.equal(formatChord(transposeChord(parseChord("C")!, 1, true)), "Db");
  assert.equal(formatChord(transposeChord(parseChord("Bb")!, 2)), "C");
  assert.equal(formatChord(transposeChord(parseChord("E")!, -1)), "D#");
  assert.equal(formatChord(transposeChord(parseChord("A")!, 12)), "A");
  assert.equal(transposeChord(c, 0), c);
});

test("keys", () => {
  assert.equal(transposeKey("F#m", 1), "Gm");
  assert.equal(transposeKey("Bb", 2), "C");
  assert.equal(transposeKey("C", 1), "Db");
  assert.equal(transposeKey("Am", -2), "Gm");
  assert.equal(transposeKey("E", 1), "F");
  assert.equal(transposeKey("Em", 3), "Gm");
  assert.equal(transposeKey("weird", 3), "weird");
  assert.equal(prefersFlats("Bb"), true);
  assert.equal(prefersFlats("Dm"), true);
  assert.equal(prefersFlats("G"), false);
  assert.equal(prefersFlats("F#m"), false);
  assert.equal(prefersFlats(null), false);
});

test("parseUgMarkup on a real excerpt", () => {
  const sheet = parseUgMarkup(UG_EXCERPT);
  assert.equal(sheet.version, 1);
  assert.deepEqual(
    sheetSections(sheet).map((s) => s.label),
    ["Intro", "Verse 1", "Chorus"],
  );
  assert.deepEqual(sheet.lines[0], {
    kind: "text",
    text: "Simplified version, A7sus4 x02033 is played",
  });
  const intro =
    sheet.lines[sheet.lines.findIndex((l) => l.kind === "section") + 1];
  assert.equal(intro.kind, "line");
  if (intro.kind === "line") {
    assert.equal(intro.lyrics, "");
    assert.deepEqual(
      intro.chords.map((p) => [p.pos, formatChord(p.chord)]),
      [
        [0, "Em"],
        [5, "G"],
        [9, "D"],
        [13, "A7sus4"],
      ],
    );
  }
  const verse = sheet.lines.find(
    (l) => l.kind === "line" && l.lyrics.startsWith("Today"),
  );
  assert.ok(verse && verse.kind === "line");
  if (verse.kind !== "line") return;
  assert.deepEqual(
    verse.chords.map((p) => [p.pos, formatChord(p.chord)]),
    [
      [0, "Em"],
      [9, "G"],
    ],
  );
  // 3 blank lines collapse to one, trailing blanks are trimmed.
  const text = sheetToPlainText(sheet);
  assert.ok(text.includes("\n\n[Chorus]"));
  assert.ok(!text.includes("\n\n\n[Chorus]"));
  assert.ok(!text.endsWith("\n"));
});

test("UG inline chords inside prose keep their lyric position", () => {
  const sheet = parseUgMarkup("Play [ch]Am[/ch] here then [ch]G[/ch] there");
  assert.deepEqual(sheet.lines, [
    {
      kind: "line",
      lyrics: "Play  here then  there",
      chords: [
        { pos: 5, chord: { root: "A", suffix: "m" } },
        { pos: 16, chord: { root: "G", suffix: "" } },
      ],
    },
  ]);
});

test("plain text detection", () => {
  const sheet = parsePlainText(
    [
      "Intro:",
      "Em  G | x2",
      "",
      "Verse 2",
      "  C   G/B",
      "hello there",
      "just words",
      "[Bridge 2]",
      "Am",
    ].join("\n"),
  );
  assert.deepEqual(
    sheet.lines.map((l) => l.kind),
    ["section", "line", "text", "section", "line", "text", "section", "line"],
  );
  assert.deepEqual(
    sheetSections(sheet).map((s) => s.label),
    ["Intro", "Verse 2", "Bridge 2"],
  );
  const paired = sheet.lines[4];
  assert.ok(paired.kind === "line");
  if (paired.kind !== "line") return;
  assert.equal(paired.lyrics, "hello there");
  assert.equal(paired.chords[0].pos, 2);
  const chordOnly = sheet.lines[1];
  assert.ok(chordOnly.kind === "line");
  if (chordOnly.kind !== "line") return;
  assert.equal(chordOnly.lyrics, "");
  assert.equal(chordOnly.chords.length, 2);
});

test("round trips", () => {
  const ug = parseUgMarkup(UG_EXCERPT);
  assert.deepEqual(parsePlainText(sheetToPlainText(ug)), ug);
  const messy = "Chorus:\n  Am   F\nlala\n\n\n\n\nG C\n";
  const once = sheetToPlainText(parsePlainText(messy));
  assert.equal(sheetToPlainText(parsePlainText(once)), once);
});

test("sheetToPlainText pushes colliding chords right", () => {
  const text = sheetToPlainText({
    version: 1,
    lines: [
      {
        kind: "line",
        lyrics: "abc",
        chords: [
          { pos: 0, chord: { root: "Em", suffix: "" } },
          { pos: 1, chord: { root: "G", suffix: "" } },
        ],
      },
    ],
  });
  assert.equal(text, "Em G\nabc");
});

test("transposeSheet", () => {
  const sheet = parsePlainText("C  G/B\nhello");
  const up = transposeSheet(sheet, 2);
  assert.equal(sheetToPlainText(up), "D  A/C#\nhello");
  assert.equal(transposeSheet(sheet, 0), sheet);
});

test("Ultimate Guitar URL validation", () => {
  assert.ok(
    isUltimateGuitarUrl(
      "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-27596",
    ),
  );
  assert.ok(isUltimateGuitarUrl("http://www.ultimate-guitar.com/x"));
  assert.ok(!isUltimateGuitarUrl("https://evil.com/?u=ultimate-guitar.com"));
  assert.ok(!isUltimateGuitarUrl("https://ultimate-guitar.com.evil.com/x"));
  assert.ok(!isUltimateGuitarUrl("ftp://ultimate-guitar.com/x"));
  assert.ok(!isUltimateGuitarUrl("not a url"));
  assert.equal(
    chordsImportSchema.safeParse({ url: "https://example.com" }).success,
    false,
  );
  assert.equal(CHORD_ERROR_CODES.noSheet, "NO_CHORD_SHEET");
});

test("UG lines keep parseable chords next to unparseable tokens", () => {
  const sheet = parseUgMarkup("[ch]G[/ch] [ch]N.C.[/ch] [ch]D[/ch]\nhello");
  const line = sheet.lines[0];
  assert.equal(line.kind, "line");
  if (line.kind === "line") {
    assert.deepEqual(
      line.chords.map((c) => formatChord(c.chord)),
      ["G", "D"],
    );
  }
});

test("6/9 chords parse as a suffix, not a slash bass", () => {
  assert.deepEqual(parseChord("G6/9"), { root: "G", suffix: "6/9" });
  assert.equal(formatChord(parseChord("C6/9")!), "C6/9");
  assert.deepEqual(parseChord("C/E"), { root: "C", suffix: "", bass: "E" });
});

test("isUltimateGuitarUrl rejects ports, credentials and lookalike hosts", () => {
  assert.equal(
    isUltimateGuitarUrl("https://tabs.ultimate-guitar.com/tab/x"),
    true,
  );
  assert.equal(
    isUltimateGuitarUrl("https://tabs.ultimate-guitar.com:8443/tab/x"),
    false,
  );
  assert.equal(
    isUltimateGuitarUrl("https://ultimate-guitar.com.evil.com/x"),
    false,
  );
  assert.equal(
    isUltimateGuitarUrl("https://user@tabs.ultimate-guitar.com/x"),
    false,
  );
});

test("Ultimate Guitar is a magic reference key on UG hosts only", () => {
  const ug = findMagicReference(" ultimate GUITAR ");
  assert.equal(ug?.label, "Ultimate Guitar");
  assert.ok(ug);
  assert.ok(isUltimateGuitarUrl(`https://${ug.hosts[0]}/x`));
  assert.ok(
    validateMagicReferenceValue(ug, "https://tabs.ultimate-guitar.com/tab/x"),
  );
  assert.ok(
    !validateMagicReferenceValue(ug, "http://tabs.ultimate-guitar.com/tab/x"),
  );
  assert.ok(!validateMagicReferenceValue(ug, "https://example.com/x"));
  assert.ok(
    !validateMagicReferenceValue(ug, "https://tabs.ultimate-guitar.com:8443/x"),
  );
  assert.ok(
    !SUGGESTIBLE_REFERENCES.some((r) => (r.key as string) === "ultimateGuitar"),
  );
});
