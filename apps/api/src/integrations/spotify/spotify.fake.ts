import {
  parseSpotifyId,
  type SpotifyAdapter,
  type SpotifyCreatePlaylistResult,
  type SpotifyPlaylist,
  type SpotifyPlaylistResult,
  type SpotifyTrack,
  type SpotifyTrackResult,
  type SpotifyWriteResult,
} from "./spotify.adapter.js";

/** Token that owns the built-in private playlist. */
export const FAKE_SPOTIFY_OWNER_TOKEN = "fake-spotify-owner-token";
export const FAKE_PUBLIC_PLAYLIST_ID = "fakePlaylistPublic";
export const FAKE_PRIVATE_PLAYLIST_ID = "fakePlaylistPrivate";

function track(
  id: string,
  title: string,
  artists: string[],
  album: string,
  durationMs: number,
): SpotifyTrack {
  return {
    id,
    uri: `spotify:track:${id}`,
    url: `https://open.spotify.com/track/${id}`,
    title,
    artists,
    album,
    albumArtUrl: `https://fake-spotify.test/art/${id}.jpg`,
    durationMs,
  };
}

const CATALOG: SpotifyTrack[] = [
  track("fakeTrack1", "Mr. Brightside", ["The Killers"], "Hot Fuss", 222000),
  track(
    "fakeTrack2",
    "Seven Nation Army",
    ["The White Stripes"],
    "Elephant",
    232000,
  ),
  track(
    "fakeTrack3",
    "Take Me Out",
    ["Franz Ferdinand"],
    "Franz Ferdinand",
    237000,
  ),
  track("fakeTrack4", "Do I Wanna Know?", ["Arctic Monkeys"], "AM", 272000),
  track(
    "fakeTrack5",
    "Float On",
    ["Modest Mouse"],
    "Good News for People Who Love Bad News",
    208000,
  ),
];

interface StoredPlaylist {
  id: string;
  name: string;
  isPublic: boolean;
  ownerToken: string;
  trackIds: string[];
}

export class FakeSpotifyAdapter implements SpotifyAdapter {
  private tracks = new Map<string, SpotifyTrack>();
  private playlists = new Map<string, StoredPlaylist>();
  private counter = 0;

  constructor() {
    this.reset();
  }

  async searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...this.tracks.values()]
      .filter((t) =>
        `${t.title} ${t.artists.join(" ")} ${t.album}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, limit)
      .map((t) => ({ ...t }));
  }

  async getTrack(idOrUrl: string): Promise<SpotifyTrackResult> {
    const id = parseSpotifyId(idOrUrl);
    const t = id ? this.tracks.get(id) : undefined;
    return t ? { status: "ok", track: { ...t } } : { status: "not-found" };
  }

  async getPublicPlaylist(idOrUrl: string): Promise<SpotifyPlaylistResult> {
    const p = this.find(idOrUrl);
    return p && p.isPublic ? this.ok(p) : { status: "not-found-or-private" };
  }

  async createPlaylist(
    userToken: string,
    input: { name: string; description?: string; isPublic?: boolean },
  ): Promise<SpotifyCreatePlaylistResult> {
    if (!this.validToken(userToken)) return { status: "unauthorized" };
    const id = `fakePlaylistCreated${++this.counter}`;
    this.playlists.set(id, {
      id,
      name: input.name,
      isPublic: input.isPublic ?? false,
      ownerToken: userToken,
      trackIds: [],
    });
    return {
      status: "ok",
      playlist: {
        id,
        name: input.name,
        url: `https://open.spotify.com/playlist/${id}`,
      },
    };
  }

  async addTracksToPlaylist(
    userToken: string,
    playlistId: string,
    trackUris: string[],
  ): Promise<SpotifyWriteResult> {
    if (!this.validToken(userToken)) return { status: "unauthorized" };
    const p = this.playlists.get(playlistId);
    if (!p || p.ownerToken !== userToken) return { status: "not-found" };
    for (const uri of trackUris) {
      const id = parseSpotifyId(uri);
      if (id && this.tracks.has(id)) p.trackIds.push(id);
    }
    return { status: "ok" };
  }

  async getPrivatePlaylist(
    userToken: string,
    idOrUrl: string,
  ): Promise<SpotifyPlaylistResult> {
    const p = this.find(idOrUrl);
    if (!p || !this.validToken(userToken))
      return { status: "not-found-or-private" };
    return p.isPublic || p.ownerToken === userToken
      ? this.ok(p)
      : { status: "not-found-or-private" };
  }

  // ---- test controls ----

  seedTrack(t: SpotifyTrack): void {
    this.tracks.set(t.id, t);
  }

  seedPlaylist(p: {
    id: string;
    name: string;
    isPublic: boolean;
    ownerToken?: string;
    trackIds: string[];
  }): void {
    this.playlists.set(p.id, { ownerToken: FAKE_SPOTIFY_OWNER_TOKEN, ...p });
  }

  /** Returns the stored playlist (including ones created via the adapter). */
  getStoredPlaylist(id: string): SpotifyPlaylist | undefined {
    const p = this.playlists.get(id);
    return p ? this.hydrate(p) : undefined;
  }

  reset(): void {
    this.counter = 0;
    this.tracks = new Map(CATALOG.map((t) => [t.id, t]));
    this.playlists = new Map();
    this.seedPlaylist({
      id: FAKE_PUBLIC_PLAYLIST_ID,
      name: "Fake Public Setlist",
      isPublic: true,
      trackIds: ["fakeTrack1", "fakeTrack2", "fakeTrack3"],
    });
    this.seedPlaylist({
      id: FAKE_PRIVATE_PLAYLIST_ID,
      name: "Fake Private Setlist",
      isPublic: false,
      trackIds: ["fakeTrack4", "fakeTrack5"],
    });
  }

  private validToken(token: string): boolean {
    return token.startsWith("fake-spotify-");
  }

  private find(idOrUrl: string): StoredPlaylist | undefined {
    const id = parseSpotifyId(idOrUrl);
    return id ? this.playlists.get(id) : undefined;
  }

  private ok(p: StoredPlaylist): SpotifyPlaylistResult {
    return { status: "ok", playlist: this.hydrate(p) };
  }

  private hydrate(p: StoredPlaylist): SpotifyPlaylist {
    return {
      id: p.id,
      name: p.name,
      url: `https://open.spotify.com/playlist/${p.id}`,
      tracks: p.trackIds.flatMap((id) => {
        const t = this.tracks.get(id);
        return t ? [{ ...t }] : [];
      }),
    };
  }
}
