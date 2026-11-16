import type {
  MusicLinkAdapter,
  MusicLinkLinks,
  MusicLinkLookup,
} from "./musiclink.adapter.js";

/** Seeded per source URL; unseeded URLs behave like MusicLink's empty result. */
export class FakeMusicLinkAdapter implements MusicLinkAdapter {
  private links = new Map<string, MusicLinkLinks>();
  private failing = false;
  private retryAfterSeconds: number | undefined;
  private calls: string[] = [];

  async findLinks(sourceUrl: string): Promise<MusicLinkLookup> {
    this.calls.push(sourceUrl);
    if (this.failing) {
      return {
        links: null,
        ...(this.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: this.retryAfterSeconds }
          : {}),
      };
    }
    return { links: { ...(this.links.get(sourceUrl) ?? {}) } };
  }

  // ---- test controls ----

  seedLinks(sourceUrl: string, links: MusicLinkLinks): void {
    this.links.set(sourceUrl, links);
  }

  /** Fails every lookup, like a 429 that carries `retryAfterSeconds`. */
  setFailing(failing: boolean, retryAfterSeconds?: number): void {
    this.failing = failing;
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /** Source URLs looked up since the last reset, in call order. */
  lookups(): string[] {
    return [...this.calls];
  }

  reset(): void {
    this.links.clear();
    this.failing = false;
    this.retryAfterSeconds = undefined;
    this.calls = [];
  }
}
