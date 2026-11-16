export const MUSICLINK = Symbol("MUSICLINK");

/** Platform links for one track, keyed by MusicLink platform name. */
export type MusicLinkLinks = Record<string, string>;

export interface MusicLinkLookup {
  /** Empty means no match; null means the lookup failed or was skipped. */
  links: MusicLinkLinks | null;
  /** Seconds the provider asked callers to wait, from a Retry-After header. */
  retryAfterSeconds?: number;
}

export interface MusicLinkAdapter {
  /** The same track on other platforms, from a Spotify track link. */
  findLinks(sourceUrl: string): Promise<MusicLinkLookup>;
}
