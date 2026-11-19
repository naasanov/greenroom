export const ULTIMATE_GUITAR = Symbol("ULTIMATE_GUITAR");

export interface UgSearchResult {
  songName: string;
  artistName: string;
  type: string | null;
  rating: number | null;
  votes: number | null;
  url: string;
  accessType: string | null;
  marketingType: string | null;
}

export interface UgTabPage {
  url: string;
  songName: string;
  artistName: string;
  type: string | null;
  isOfficial: boolean;
  /** Raw wiki markup with [ch] and [tab] tags; empty for official pages. */
  content: string;
  key: string | null;
  capo: number | null;
  tuning: string | null;
}

/** Blocked, network failure, timeout or a non-200 response. */
export class UgUnavailableError extends Error {}

/** The page loaded but its structure was not recognized. */
export class UgParseError extends Error {}

export interface UltimateGuitarAdapter {
  search(query: string): Promise<UgSearchResult[]>;
  fetchTab(url: string): Promise<UgTabPage>;
}
