import type { SongsterrAdapter } from "./songsterr.adapter.js";

interface Tab {
  title: string;
  artist: string;
  url: string;
}

const DEFAULT_TABS: Tab[] = [
  {
    title: "Mr. Brightside",
    artist: "The Killers",
    url: "https://www.songsterr.com/a/wsa/the-killers-mr-brightside-tab-s1",
  },
  {
    title: "Seven Nation Army",
    artist: "The White Stripes",
    url: "https://www.songsterr.com/a/wsa/the-white-stripes-seven-nation-army-tab-s2",
  },
];

export class FakeSongsterrAdapter implements SongsterrAdapter {
  private tabs: Tab[] = [];

  constructor() {
    this.reset();
  }

  async searchTab(input: {
    title: string;
    artist?: string;
  }): Promise<{ url: string } | null> {
    const title = input.title.trim().toLowerCase();
    const artist = input.artist?.trim().toLowerCase();
    const hit = this.tabs.find(
      (t) =>
        t.title.toLowerCase() === title &&
        (!artist || t.artist.toLowerCase().includes(artist)),
    );
    return hit ? { url: hit.url } : null;
  }

  // ---- test controls ----

  seedTab(tab: Tab): void {
    this.tabs.push(tab);
  }

  reset(): void {
    this.tabs = DEFAULT_TABS.map((t) => ({ ...t }));
  }
}
