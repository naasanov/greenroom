export const SPOTIFY = Symbol("SPOTIFY");

export interface SpotifyTrack {
  id: string;
  uri: string;
  url: string;
  title: string;
  artists: string[];
  album: string;
  albumArtUrl: string | null;
  durationMs: number;
}

export interface SpotifyPlaylist {
  id: string;
  url: string;
  name: string;
  tracks: SpotifyTrack[];
}

export type SpotifyTrackResult =
  { status: "ok"; track: SpotifyTrack } | { status: "not-found" };

/** Private and nonexistent playlists are indistinguishable to the API. */
export type SpotifyPlaylistResult =
  | { status: "ok"; playlist: SpotifyPlaylist }
  | { status: "not-found-or-private" }
  | { status: "unauthorized" };

export const SPOTIFY_IMPORT_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
];

export const SPOTIFY_EXPORT_SCOPES = [
  ...SPOTIFY_IMPORT_SCOPES,
  "playlist-modify-private",
  "playlist-modify-public",
];

export interface SpotifyUserTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  scopes: string[];
}

export interface SpotifyProfile {
  id: string;
  displayName: string | null;
}

export type SpotifyExchangeResult =
  | { status: "ok"; tokens: SpotifyUserTokens; profile: SpotifyProfile }
  | { status: "invalid-code" };

export type SpotifyRefreshResult =
  | {
      status: "ok";
      accessToken: string;
      /** Present only when Spotify rotated the refresh token. */
      refreshToken: string | null;
      expiresAt: string;
    }
  | { status: "invalid-grant" };

export type SpotifyWriteResult =
  { status: "ok" } | { status: "unauthorized" } | { status: "not-found" };

export type SpotifyCreatePlaylistResult =
  | { status: "ok"; playlist: Omit<SpotifyPlaylist, "tracks"> }
  | { status: "unauthorized" };

export interface SpotifyAdapter {
  /** App-level (client credentials) operations. */
  searchTracks(query: string, limit?: number): Promise<SpotifyTrack[]>;
  /** Accepts a bare id, a spotify: URI, or an open.spotify.com URL. */
  getTrack(idOrUrl: string): Promise<SpotifyTrackResult>;

  /** User OAuth (authorization code flow). */
  buildAuthUrl(input: {
    redirectUri: string;
    state: string;
    scopes: string[];
  }): string;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<SpotifyExchangeResult>;
  refreshAccessToken(refreshToken: string): Promise<SpotifyRefreshResult>;

  /** User-level operations take the user's access token. */
  getPlaylist(
    userToken: string,
    idOrUrl: string,
  ): Promise<SpotifyPlaylistResult>;
  createPlaylist(
    userToken: string,
    input: { name: string; description?: string; isPublic?: boolean },
  ): Promise<SpotifyCreatePlaylistResult>;
  addTracksToPlaylist(
    userToken: string,
    playlistId: string,
    trackUris: string[],
  ): Promise<SpotifyWriteResult>;
}

/** Extracts a Spotify id from an id, URI, or URL; null if nothing plausible. */
export function parseSpotifyId(idOrUrl: string): string | null {
  const s = idOrUrl.trim();
  const m =
    /spotify:(?:track|playlist):([A-Za-z0-9_-]+)/.exec(s) ??
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?(?:track|playlist)\/([A-Za-z0-9_-]+)/.exec(
      s,
    );
  if (m?.[1]) return m[1];
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
}
