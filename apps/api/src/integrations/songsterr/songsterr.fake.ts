import type { SongsterrAdapter, SongsterrTabs } from "./songsterr.adapter.js";

interface Entry extends SongsterrTabs {
  title: string;
  artist: string;
}

const DEFAULTS: Entry[] = [
  {
    title: "Mr. Brightside",
    artist: "The Killers",
    guitar:
      "https://www.songsterr.com/a/wsa/the-killers-mr-brightside-tab-s1t0",
  },
  {
    title: "Seven Nation Army",
    artist: "The White Stripes",
    guitar:
      "https://www.songsterr.com/a/wsa/the-white-stripes-seven-nation-army-tab-s2t0",
  },
];

export class FakeSongsterrAdapter implements SongsterrAdapter {
  private entries: Entry[] = [];
  private failing = false;
  private calls: string[] = [];

  constructor() {
    this.reset();
  }

  async findTabs(input: {
    title: string;
    artist?: string;
  }): Promise<SongsterrTabs | null> {
    this.calls.push(input.title);
    if (this.failing) return null;
    const title = input.title.trim().toLowerCase();
    const artist = input.artist?.trim().toLowerCase();
    const hit = this.entries.find(
      (e) =>
        e.title.toLowerCase() === title &&
        (!artist || e.artist.toLowerCase().includes(artist)),
    );
    if (!hit) return {};
    return {
      ...(hit.bass ? { bass: hit.bass } : {}),
      ...(hit.guitar ? { guitar: hit.guitar } : {}),
    };
  }

  // ---- test controls ----

  seedTabs(entry: Entry): void {
    this.entries.unshift(entry);
  }

  setFailing(failing: boolean): void {
    this.failing = failing;
  }

  /** Titles looked up since the last reset, in call order. */
  lookups(): string[] {
    return [...this.calls];
  }

  reset(): void {
    this.entries = DEFAULTS.map((e) => ({ ...e }));
    this.failing = false;
    this.calls = [];
  }
}
