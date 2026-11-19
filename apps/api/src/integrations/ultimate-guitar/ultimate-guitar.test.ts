import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { UgParseError } from "./ultimate-guitar.adapter.js";
import {
  decodeHtmlEntities,
  parseUgSearchPage,
  parseUgTabPage,
} from "./ultimate-guitar.parse.js";

// Fixtures stay in src; the compiled test finds them relative to dist.
const fixture = (name: string): string =>
  readFileSync(
    fileURLToPath(
      new URL(
        `../../../src/integrations/ultimate-guitar/__fixtures__/${name}`,
        import.meta.url,
      ),
    ),
    "utf8",
  );

describe("decodeHtmlEntities", () => {
  it("decodes named, decimal and hex entities", () => {
    assert.equal(
      decodeHtmlEntities("&quot;a&quot; &amp; &lt;b&gt; it&#39;s &#x41;&#66;"),
      `"a" & <b> it's AB`,
    );
  });
  it("leaves unknown entities alone and decodes ampersands once", () => {
    assert.equal(decodeHtmlEntities("&bogus; &amp;lt;"), "&bogus; &lt;");
  });
});

describe("parseUgSearchPage", () => {
  const results = parseUgSearchPage(fixture("search.html"));

  it("maps result fields", () => {
    assert.ok(results.length > 20);
    const top = results.find(
      (r) =>
        r.url ===
        "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-39144",
    );
    assert.deepEqual(top, {
      songName: "Wonderwall",
      artistName: "Oasis",
      type: "Chords",
      rating: 4.84671,
      votes: 12661,
      url: "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-39144",
      accessType: "public",
      marketingType: null,
    });
  });

  it("keeps marketing results so callers can exclude them", () => {
    assert.ok(results.some((r) => r.marketingType === "official"));
    assert.ok(results.some((r) => r.marketingType === "TabPro"));
  });

  it("rejects a page without a js-store element", () => {
    assert.throws(() => parseUgSearchPage("<html></html>"), UgParseError);
  });
});

describe("parseUgTabPage", () => {
  const url =
    "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-chords-6125";

  it("reads content and meta from a community chords page", () => {
    const tab = parseUgTabPage(fixture("chords.html"), url);
    assert.equal(tab.isOfficial, false);
    assert.equal(tab.songName, "Wonderwall");
    assert.equal(tab.artistName, "Oasis");
    assert.equal(tab.type, "Chords");
    assert.equal(tab.capo, 2);
    assert.equal(tab.key, "F#m");
    assert.equal(tab.tuning, "E A D G B E");
    assert.match(tab.content, /\[ch\]A7sus4\[\/ch\]/);
    assert.ok(tab.content.length > 500);
  });

  it("flags the Official page", () => {
    const official = parseUgTabPage(
      fixture("official.html"),
      "https://tabs.ultimate-guitar.com/tab/oasis/wonderwall-official-1910851",
    );
    assert.equal(official.isOfficial, true);
    assert.equal(official.content, "");
  });

  it("flags official and pro URLs without needing the page body", () => {
    const page = fixture("official.html");
    assert.equal(
      parseUgTabPage(page, "https://www.ultimate-guitar.com/pro/?tab_id=1")
        .isOfficial,
      true,
    );
  });

  it("throws a parse error when the structure is unrecognized", () => {
    assert.throws(
      () => parseUgTabPage(fixture("search.html"), url),
      UgParseError,
    );
  });
});
