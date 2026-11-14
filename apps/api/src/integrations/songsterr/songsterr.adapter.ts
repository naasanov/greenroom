export const SONGSTERR = Symbol("SONGSTERR");

/** Tab URLs for the instruments that have a track; absent means no track. */
export interface SongsterrTabs {
  bass?: string;
  guitar?: string;
}

export interface SongsterrAdapter {
  /** Tabs for the best title/artist match; null when the lookup failed. */
  findTabs(input: {
    title: string;
    artist?: string;
  }): Promise<SongsterrTabs | null>;
}
