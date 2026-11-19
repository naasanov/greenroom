import {
  UgUnavailableError,
  type UgSearchResult,
  type UgTabPage,
  type UltimateGuitarAdapter,
} from "./ultimate-guitar.adapter.js";

const BASE = "https://tabs.ultimate-guitar.com/tab/fake";

const FAKE_CONTENT = [
  "[Intro]",
  "[ch]Em[/ch] [ch]G[/ch] [ch]D[/ch] [ch]A7sus4[/ch]",
  "",
  "[Verse 1]",
  "[tab][ch]Em[/ch]            [ch]G[/ch]",
  "Today is gonna be the day",
  "[ch]D[/ch]                [ch]A7sus4[/ch]",
  "That they're gonna throw it back to you[/tab]",
  "",
  "[Chorus]",
  "[tab][ch]C[/ch]       [ch]D[/ch]      [ch]Em[/ch]",
  "Because maybe[/tab]",
].join("\r\n");

const result = (n: number, rating: number, votes: number): UgSearchResult => ({
  songName: "Wonderwall",
  artistName: "Fake Band",
  type: "Chords",
  rating,
  votes,
  url: `${BASE}/wonderwall-chords-${n}`,
  accessType: "public",
  marketingType: null,
});

/** Deterministic Ultimate Guitar: only the title "Wonderwall" has results. */
export class FakeUltimateGuitarAdapter implements UltimateGuitarAdapter {
  private searchCalls: string[] = [];
  private fetchCalls: string[] = [];
  private failing = false;

  async search(query: string): Promise<UgSearchResult[]> {
    this.searchCalls.push(query);
    if (this.failing) throw new UgUnavailableError("fake: forced failure");
    if (!/\bwonderwall\b/i.test(query)) return [];
    return [
      {
        songName: "Wonderwall",
        artistName: "Fake Band",
        type: "Official",
        rating: 5,
        votes: 9000,
        url: `${BASE}/wonderwall-official-1`,
        accessType: "public",
        marketingType: null,
      },
      result(1, 4.9, 3),
      result(2, 4.6, 2500),
      result(3, 4.8, 400),
    ];
  }

  async fetchTab(url: string): Promise<UgTabPage> {
    this.fetchCalls.push(url);
    if (this.failing) throw new UgUnavailableError("fake: forced failure");
    if (/\/tab\/fake\/broken-/.test(url)) {
      throw new UgUnavailableError("fake: Ultimate Guitar is unavailable");
    }
    const m = /\/tab\/fake\/(.+)-(chords|official)-(\d+)$/.exec(url);
    const slug = m?.[1] ?? "unknown";
    const name = slug.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    const base = { url, songName: name, artistName: "Fake Band" };
    if (m?.[2] === "official") {
      return {
        ...base,
        type: "Official",
        isOfficial: true,
        content: "",
        key: null,
        capo: null,
        tuning: null,
      };
    }
    return {
      ...base,
      type: "Chords",
      isOfficial: false,
      content: FAKE_CONTENT,
      key: "Em",
      capo: 2,
      tuning: "E A D G B E",
    };
  }

  // ---- test controls ----

  /** Makes every search and fetch throw UgUnavailableError. */
  setFailing(failing: boolean): void {
    this.failing = failing;
  }

  /** Search queries received since the last reset. */
  searches(): string[] {
    return [...this.searchCalls];
  }

  /** Tab URLs fetched since the last reset. */
  fetches(): string[] {
    return [...this.fetchCalls];
  }

  reset(): void {
    this.failing = false;
    this.searchCalls = [];
    this.fetchCalls = [];
  }
}
