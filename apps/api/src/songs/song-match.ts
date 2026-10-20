/** Lowercased, accent-stripped, alphanumeric-only form used for duplicate matching. */
export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export const titleArtistKey = (
  title: string,
  artist: string | null | undefined,
): string => `${normalizeText(title)}|${normalizeText(artist)}`;

export interface MatchableSong {
  id: string;
  title: string;
  artist: string | null;
  spotifyTrackId: string | null;
}

/** Looks songs up by Spotify track id or by normalized title + artist. */
export class SongIndex {
  private bySpotify = new Map<string, string>();
  private byKey = new Map<string, string>();

  constructor(songs: MatchableSong[] = []) {
    for (const s of songs) this.add(s);
  }

  add(s: MatchableSong): void {
    if (s.spotifyTrackId) this.bySpotify.set(s.spotifyTrackId, s.id);
    this.byKey.set(titleArtistKey(s.title, s.artist), s.id);
  }

  find(input: {
    title: string;
    artist?: string | null;
    spotifyTrackId?: string | null;
  }): string | null {
    if (input.spotifyTrackId) {
      const hit = this.bySpotify.get(input.spotifyTrackId);
      if (hit) return hit;
    }
    return this.byKey.get(titleArtistKey(input.title, input.artist)) ?? null;
  }
}
