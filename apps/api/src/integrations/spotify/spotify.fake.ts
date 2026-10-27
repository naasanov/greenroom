import { apiPublicUrl } from "../../auth/auth.constants.js";
import { stagingLoginEnabled } from "../../staging-login/staging-login.enabled.js";
import {
  parseSpotifyId,
  type SpotifyAdapter,
  type SpotifyCreatePlaylistResult,
  type SpotifyExchangeResult,
  type SpotifyPlaylist,
  type SpotifyPlaylistResult,
  type SpotifyRefreshResult,
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

const CODE_PREFIX = "fake-code:";

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

// Staging-only set returned for any playlist id; not part of search.
const DEMO_TRACKS: SpotifyTrack[] = [
  track(
    "demoTrack1",
    "Everlong",
    ["Foo Fighters"],
    "The Colour and the Shape",
    250000,
  ),
  track(
    "demoTrack2",
    "Know Your Enemy",
    ["Green Day"],
    "21st Century Breakdown",
    191000,
  ),
  track("demoTrack3", "Last Nite", ["The Strokes"], "Is This It", 193000),
  track(
    "demoTrack4",
    "Pumped Up Kicks",
    ["Foster the People"],
    "Torches",
    239000,
  ),
  track(
    "demoTrack5",
    "Little Lion Man",
    ["Mumford & Sons"],
    "Sigh No More",
    247000,
  ),
  track(
    "demoTrack6",
    "Heads Will Roll",
    ["Yeah Yeah Yeahs"],
    "It's Blitz!",
    221000,
  ),
  track(
    "demoTrack7",
    "Time to Pretend",
    ["MGMT"],
    "Oracular Spectacular",
    261000,
  ),
  track(
    "demoTrack8",
    "Dog Days Are Over",
    ["Florence + The Machine"],
    "Lungs",
    253000,
  ),
  track("demoTrack9", "Ho Hey", ["The Lumineers"], "The Lumineers", 163000),
  track("demoTrack10", "Reptilia", ["The Strokes"], "Room on Fire", 221000),
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
  private created: string[] = [];
  private counter = 0;
  private refreshTokens = new Set<string>();
  // Scopes of the latest authorize URL; the next code exchange grants them.
  private requestedScopes: string[] = [];

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

  buildAuthUrl(input: {
    redirectUri: string;
    state: string;
    scopes: string[];
  }): string {
    this.requestedScopes = [...input.scopes];
    // With a staging passcode set, the API serves its own consent page.
    if (stagingLoginEnabled()) {
      return `${apiPublicUrl()}/fake-spotify/authorize?${new URLSearchParams({
        redirect_uri: input.redirectUri,
        state: input.state,
      })}`;
    }
    return `https://fake-accounts.spotify.test/authorize?${new URLSearchParams({
      redirect_uri: input.redirectUri,
      state: input.state,
      scope: input.scopes.join(" "),
    })}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<SpotifyExchangeResult> {
    if (!input.code.startsWith(CODE_PREFIX)) return { status: "invalid-code" };
    const name = input.code.slice(CODE_PREFIX.length);
    if (!name) return { status: "invalid-code" };
    const n = ++this.counter;
    const refreshToken = `fake-spotify-refresh-${n}`;
    this.refreshTokens.add(refreshToken);
    return {
      status: "ok",
      profile: { id: `fake-spotify-user-${name}`, displayName: name },
      tokens: {
        accessToken: `fake-spotify-access-${n}`,
        refreshToken,
        expiresAt: this.expiry(),
        scopes: this.requestedScopes.length
          ? [...this.requestedScopes]
          : ["playlist-read-private", "playlist-read-collaborative"],
      },
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<SpotifyRefreshResult> {
    if (!this.refreshTokens.has(refreshToken))
      return { status: "invalid-grant" };
    return {
      status: "ok",
      accessToken: `fake-spotify-access-${++this.counter}`,
      refreshToken: null,
      expiresAt: this.expiry(),
    };
  }

  async getPlaylist(
    userToken: string,
    idOrUrl: string,
  ): Promise<SpotifyPlaylistResult> {
    if (!this.validToken(userToken)) return { status: "unauthorized" };
    const p = this.find(idOrUrl);
    if (p) {
      return p.isPublic || p.ownerToken === userToken
        ? this.ok(p)
        : { status: "not-found-or-private" };
    }
    // Staging has no real playlists, so any id resolves to the demo set.
    const id = parseSpotifyId(idOrUrl);
    if (stagingLoginEnabled() && id) {
      return {
        status: "ok",
        playlist: {
          id,
          name: "Demo Setlist",
          url: `https://open.spotify.com/playlist/${id}`,
          tracks: DEMO_TRACKS.map((t) => ({ ...t })),
        },
      };
    }
    return { status: "not-found-or-private" };
  }

  async createPlaylist(
    userToken: string,
    input: { name: string; description?: string; isPublic?: boolean },
  ): Promise<SpotifyCreatePlaylistResult> {
    if (!this.validToken(userToken)) return { status: "unauthorized" };
    const id = `fakePlaylistCreated${++this.counter}`;
    this.created.push(id);
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
      if (id) p.trackIds.push(id);
    }
    return { status: "ok" };
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

  /** Playlists created through the adapter, in creation order. */
  createdPlaylists(): {
    id: string;
    name: string;
    isPublic: boolean;
    trackIds: string[];
  }[] {
    return this.created.flatMap((id) => {
      const p = this.playlists.get(id);
      return p
        ? [
            {
              id: p.id,
              name: p.name,
              isPublic: p.isPublic,
              trackIds: [...p.trackIds],
            },
          ]
        : [];
    });
  }

  /** Makes every issued refresh token fail with invalid-grant. */
  revokeRefreshTokens(): void {
    this.refreshTokens.clear();
  }

  reset(): void {
    this.counter = 0;
    this.created = [];
    this.requestedScopes = [];
    this.refreshTokens.clear();
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

  private expiry(): string {
    return new Date(Date.UTC(2030, 0, 1)).toISOString();
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
