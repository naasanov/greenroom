import type { OdesliAdapter, OdesliLinks } from "./odesli.adapter.js";

/** Seeded per source URL; unseeded URLs behave like Odesli's empty result. */
export class FakeOdesliAdapter implements OdesliAdapter {
  private links = new Map<string, OdesliLinks>();
  private failing = false;
  private calls: string[] = [];

  async findLinks(sourceUrl: string): Promise<OdesliLinks | null> {
    this.calls.push(sourceUrl);
    if (this.failing) return null;
    return { ...(this.links.get(sourceUrl) ?? {}) };
  }

  // ---- test controls ----

  seedLinks(sourceUrl: string, links: OdesliLinks): void {
    this.links.set(sourceUrl, links);
  }

  setFailing(failing: boolean): void {
    this.failing = failing;
  }

  /** Source URLs looked up since the last reset, in call order. */
  lookups(): string[] {
    return [...this.calls];
  }

  reset(): void {
    this.links.clear();
    this.failing = false;
    this.calls = [];
  }
}
