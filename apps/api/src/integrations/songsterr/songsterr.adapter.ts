export const SONGSTERR = Symbol("SONGSTERR");

export interface SongsterrAdapter {
  /** Best-match tab URL, or null when nothing matches. */
  searchTab(input: {
    title: string;
    artist?: string;
  }): Promise<{ url: string } | null>;
}
