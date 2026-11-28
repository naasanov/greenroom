import {
  parseSpotifyId,
  type SpotifyAdapter,
  type SpotifyCreatePlaylistResult,
  type SpotifyExchangeResult,
  type SpotifyPlaylistCheckResult,
  type SpotifyPlaylistResult,
  type SpotifyRefreshResult,
  type SpotifyTrack,
  type SpotifyTrackResult,
  type SpotifyWriteResult,
} from "./spotify.adapter.js";
import { httpFailure, httpRequest, type HttpOptions } from "../http.js";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const TIMEOUT_MS = 8000;
const TOKEN_SKEW_MS = 60_000;
const MAX_RETRY_WAIT_MS = 5000;
// One retry on 429 only; a Retry-After wait is capped at MAX_RETRY_WAIT_MS.
const RETRY_429: Pick<
  HttpOptions,
  | "timeoutMs"
  | "maxRetries"
  | "retryStatuses"
  | "fallbackDelayMs"
  | "maxDelayMs"
> = {
  timeoutMs: TIMEOUT_MS,
  maxRetries: 1,
  retryStatuses: [429],
  fallbackDelayMs: 1000,
  maxDelayMs: MAX_RETRY_WAIT_MS,
};
const SEARCH_MAX = 50;

const ADD_BATCH = 100;

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

function mapTrack(raw: unknown): SpotifyTrack | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id || raw.is_local === true) return null;
  if (raw.type !== undefined && raw.type !== "track") return null;
  const album = isObj(raw.album) ? raw.album : {};
  const images = Array.isArray(album.images) ? album.images : [];
  // Prefer the smallest image that is at least 300px wide, else the largest.
  const sized = images
    .filter(isObj)
    .map((i) => ({
      url: str(i.url),
      w: typeof i.width === "number" ? i.width : 0,
    }))
    .filter((i): i is { url: string; w: number } => i.url !== null)
    .sort((a, b) => b.w - a.w);
  const art = sized.filter((i) => i.w >= 300).at(-1) ?? sized[0];
  const ext = isObj(raw.external_urls) ? raw.external_urls : {};
  const artists = Array.isArray(raw.artists)
    ? raw.artists
        .map((a) => (isObj(a) ? str(a.name) : null))
        .filter((n): n is string => n !== null)
    : [];
  return {
    id,
    uri: str(raw.uri) ?? `spotify:track:${id}`,
    url: str(ext.spotify) ?? `https://open.spotify.com/track/${id}`,
    title: str(raw.name) ?? "",
    artists,
    album: str(album.name) ?? "",
    albumArtUrl: art?.url ?? null,
    durationMs: typeof raw.duration_ms === "number" ? raw.duration_ms : 0,
  };
}

const expiryFrom = (expiresIn: unknown): string =>
  new Date(
    Date.now() + (typeof expiresIn === "number" ? expiresIn : 3600) * 1000,
  ).toISOString();

function playlistMiss(status: number): SpotifyPlaylistResult | null {
  if (status === 401) return { status: "unauthorized" };
  if (status === 403) return { status: "forbidden" };
  if ([400, 404].includes(status)) {
    return { status: "not-found-or-private" };
  }
  return null;
}

/** A page of items that Spotify refuses while the playlist itself resolved. */
const isItemsMiss = (status: number): boolean =>
  status === 403 || status === 404 || status === 400;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Track count from an items page, falling back to the playlist metadata. */
function playlistTotal(meta: Json, page: unknown): number | null {
  const nested = (v: unknown) => (isObj(v) ? num(v.total) : null);
  return (
    (isObj(page) ? num(page.total) : null) ??
    nested(meta.items) ??
    nested(meta.tracks)
  );
}

/** A 200 first page that lists no items for a non-empty playlist is metadata only. */
function isUnreadablePage(meta: Json, page: unknown): boolean {
  const items = isObj(page) && Array.isArray(page.items) ? page.items : null;
  return !items || (items.length === 0 && (playlistTotal(meta, page) ?? 0) > 0);
}

/** Spotify Web API: app-level reads plus user OAuth and user-token reads. */
export class RealSpotifyAdapter implements SpotifyAdapter {
  private token: { value: string; expiresAt: number } | null = null;
  private tokenPending: Promise<string> | null = null;

  async searchTracks(query: string, limit = 10): Promise<SpotifyTrack[]> {
    const q = query.trim();
    if (!q) return [];
    const n = Math.min(SEARCH_MAX, Math.max(1, Math.floor(limit) || 1));
    const params = new URLSearchParams({
      q,
      type: "track",
      limit: String(n),
    });
    const res = await this.api(`/search?${params}`);
    if (!res.ok) throw await failure("search", res);
    const body: unknown = await res.json();
    const items =
      isObj(body) && isObj(body.tracks) && Array.isArray(body.tracks.items)
        ? body.tracks.items
        : [];
    return items.map(mapTrack).filter((t): t is SpotifyTrack => t !== null);
  }

  async getTrack(idOrUrl: string): Promise<SpotifyTrackResult> {
    const id = parseSpotifyId(idOrUrl);
    if (!id) return { status: "not-found" };
    const res = await this.api(`/tracks/${encodeURIComponent(id)}`);
    if (res.status === 404 || res.status === 400) {
      return { status: "not-found" };
    }
    if (!res.ok) throw await failure("track lookup", res);
    const track = mapTrack(await res.json());
    return track ? { status: "ok", track } : { status: "not-found" };
  }

  buildAuthUrl(input: {
    redirectUri: string;
    state: string;
    scopes: string[];
  }): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.SPOTIFY_CLIENT_ID ?? "",
      scope: input.scopes.join(" "),
      redirect_uri: input.redirectUri,
      state: input.state,
    });
    return `${AUTHORIZE_URL}?${params}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<SpotifyExchangeResult> {
    const res = await this.tokenRequest({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
    });
    if (res.status === 400) return { status: "invalid-code" };
    if (!res.ok) throw await failure("code exchange", res);
    const body: unknown = await res.json();
    const accessToken = isObj(body) ? str(body.access_token) : null;
    const refreshToken = isObj(body) ? str(body.refresh_token) : null;
    if (!isObj(body) || !accessToken || !refreshToken)
      throw new Error("Spotify code exchange response missing tokens");

    const me = await httpRequest(
      `${API_URL}/me`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      { timeoutMs: TIMEOUT_MS },
    );
    if (!me.ok) throw await failure("profile lookup", me);
    const profile: unknown = await me.json();
    const id = isObj(profile) ? str(profile.id) : null;
    if (!isObj(profile) || !id)
      throw new Error("Spotify profile response had no id");
    return {
      status: "ok",
      tokens: {
        accessToken,
        refreshToken,
        expiresAt: expiryFrom(body.expires_in),
        scopes: (str(body.scope) ?? "").split(" ").filter(Boolean),
      },
      profile: { id, displayName: str(profile.display_name) },
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<SpotifyRefreshResult> {
    const res = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (res.status === 400) return { status: "invalid-grant" };
    if (!res.ok) throw await failure("token refresh", res);
    const body: unknown = await res.json();
    const accessToken = isObj(body) ? str(body.access_token) : null;
    if (!isObj(body) || !accessToken)
      throw new Error("Spotify refresh response had no access_token");
    return {
      status: "ok",
      accessToken,
      refreshToken: str(body.refresh_token),
      expiresAt: expiryFrom(body.expires_in),
    };
  }

  /** Reads through the user's token; the app token cannot read playlist items. */
  async getPlaylist(
    userToken: string,
    idOrUrl: string,
  ): Promise<SpotifyPlaylistResult> {
    const id = parseSpotifyId(idOrUrl);
    if (!id) return { status: "not-found-or-private" };
    const enc = encodeURIComponent(id);
    const head = await this.playlistHead(userToken, enc);
    if ("miss" in head) return head.miss;
    const meta = head.meta;

    const tracks: SpotifyTrack[] = [];
    let next: string | null = `${API_URL}/playlists/${enc}/items?limit=100`;
    let firstPage = true;
    while (next) {
      const res = await this.userGet(userToken, next);
      if (res.status === 401) return { status: "unauthorized" };
      if (isItemsMiss(res.status)) {
        return { status: "metadata-only", name: str(meta.name) };
      }
      if (!res.ok) throw await failure("playlist page", res);
      const page: unknown = await res.json();
      if (firstPage && isUnreadablePage(meta, page)) {
        return { status: "metadata-only", name: str(meta.name) };
      }
      firstPage = false;
      if (!isObj(page)) break;
      for (const entry of Array.isArray(page.items) ? page.items : []) {
        if (!isObj(entry)) continue;
        // The track sits under `item` or `track` depending on API version.
        const t = mapTrack(entry.item ?? entry.track);
        if (t) tracks.push(t);
      }
      next = str(page.next);
    }

    const ext = isObj(meta.external_urls) ? meta.external_urls : {};
    return {
      status: "ok",
      playlist: {
        id: str(meta.id) ?? id,
        url: str(ext.spotify) ?? `https://open.spotify.com/playlist/${id}`,
        name: str(meta.name) ?? "",
        tracks,
      },
    };
  }

  /** One metadata read plus a one-item page: enough to tell readable from metadata-only. */
  async checkPlaylist(
    userToken: string,
    idOrUrl: string,
  ): Promise<SpotifyPlaylistCheckResult> {
    const id = parseSpotifyId(idOrUrl);
    if (!id) return { status: "not-found" };
    const enc = encodeURIComponent(id);
    const head = await this.playlistHead(userToken, enc);
    if ("miss" in head) {
      const { status } = head.miss;
      if (status === "unauthorized") return { status };
      return status === "forbidden"
        ? { status: "metadata-only", name: null }
        : { status: "not-found" };
    }
    const meta = head.meta;
    const name = str(meta.name);
    const res = await this.userGet(
      userToken,
      `/playlists/${enc}/items?limit=1`,
    );
    if (res.status === 401) return { status: "unauthorized" };
    if (isItemsMiss(res.status)) return { status: "metadata-only", name };
    if (!res.ok) throw await failure("playlist page", res);
    const page: unknown = await res.json();
    if (isUnreadablePage(meta, page)) return { status: "metadata-only", name };
    return {
      status: "ok",
      name: name ?? "",
      trackCount: playlistTotal(meta, page),
    };
  }

  async createPlaylist(
    userToken: string,
    input: { name: string; description?: string; isPublic?: boolean },
  ): Promise<SpotifyCreatePlaylistResult> {
    const res = await this.userSend(userToken, "POST", "/me/playlists", {
      name: input.name,
      description: input.description ?? "",
      public: input.isPublic ?? false,
    });
    if (res.status === 401 || res.status === 403) {
      return { status: "unauthorized" };
    }
    if (!res.ok) throw await failure("playlist create", res);
    const body: unknown = await res.json();
    const id = isObj(body) ? str(body.id) : null;
    if (!isObj(body) || !id)
      throw new Error("Spotify playlist create response had no id");
    const ext = isObj(body.external_urls) ? body.external_urls : {};
    return {
      status: "ok",
      playlist: {
        id,
        name: str(body.name) ?? input.name,
        url: str(ext.spotify) ?? `https://open.spotify.com/playlist/${id}`,
      },
    };
  }

  /** Adds in batches of 100, the per-request maximum. */
  async addTracksToPlaylist(
    userToken: string,
    playlistId: string,
    trackUris: string[],
  ): Promise<SpotifyWriteResult> {
    const enc = encodeURIComponent(playlistId);
    for (let i = 0; i < trackUris.length; i += ADD_BATCH) {
      const res = await this.userSend(
        userToken,
        "POST",
        `/playlists/${enc}/items`,
        { uris: trackUris.slice(i, i + ADD_BATCH) },
      );
      if (res.status === 401 || res.status === 403) {
        return { status: "unauthorized" };
      }
      if (res.status === 404) return { status: "not-found" };
      if (!res.ok) throw await failure("playlist add", res);
    }
    return { status: "ok" };
  }

  /** Playlist metadata, or the miss result when Spotify refuses the lookup. */
  private async playlistHead(
    userToken: string,
    encodedId: string,
  ): Promise<{ meta: Json } | { miss: SpotifyPlaylistResult }> {
    const res = await this.userGet(
      userToken,
      `/playlists/${encodedId}?fields=id,name,external_urls.spotify,items.total,tracks.total`,
    );
    const miss = playlistMiss(res.status);
    if (miss) return { miss };
    if (!res.ok) throw await failure("playlist lookup", res);
    const meta: unknown = await res.json();
    if (!isObj(meta)) return { miss: { status: "not-found-or-private" } };
    return { meta };
  }

  private tokenRequest(form: Record<string, string>): Promise<Response> {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id || !secret) {
      throw new Error(
        "Spotify credentials missing: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET",
      );
    }
    return httpRequest(
      TOKEN_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(form),
      },
      { timeoutMs: TIMEOUT_MS },
    );
  }

  /** JSON write with a user token; retries once on 429. */
  private userSend(
    userToken: string,
    method: "POST",
    path: string,
    body: unknown,
  ): Promise<Response> {
    return httpRequest(
      API_URL + path,
      {
        method,
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      RETRY_429,
    );
  }

  /** GET with a user token; retries once on 429. */
  private userGet(userToken: string, pathOrUrl: string): Promise<Response> {
    return httpRequest(
      pathOrUrl.startsWith("http") ? pathOrUrl : API_URL + pathOrUrl,
      { headers: { Authorization: `Bearer ${userToken}` } },
      RETRY_429,
    );
  }

  /** GET with bearer auth; retries once on 401 (fresh token) and on 429. */
  private api(pathOrUrl: string): Promise<Response> {
    return httpRequest(
      pathOrUrl.startsWith("http") ? pathOrUrl : API_URL + pathOrUrl,
      async () => ({
        headers: { Authorization: `Bearer ${await this.getToken()}` },
      }),
      {
        ...RETRY_429,
        onUnauthorized: () => {
          this.token = null;
        },
      },
    );
  }

  private getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) {
      return Promise.resolve(this.token.value);
    }
    this.tokenPending ??= this.fetchToken().finally(() => {
      this.tokenPending = null;
    });
    return this.tokenPending;
  }

  private async fetchToken(): Promise<string> {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id || !secret) {
      const missing = [
        !id && "SPOTIFY_CLIENT_ID",
        !secret && "SPOTIFY_CLIENT_SECRET",
      ].filter(Boolean);
      throw new Error(
        `Spotify credentials missing: set ${missing.join(" and ")}`,
      );
    }
    const res = await httpRequest(
      TOKEN_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
      { timeoutMs: TIMEOUT_MS },
    );
    if (!res.ok) throw await failure("token request", res);
    const body: unknown = await res.json();
    const value = isObj(body) ? str(body.access_token) : null;
    if (!value) throw new Error("Spotify token response had no access_token");
    const ttl =
      isObj(body) && typeof body.expires_in === "number"
        ? body.expires_in
        : 3600;
    this.token = {
      value,
      expiresAt: Date.now() + Math.max(0, ttl * 1000 - TOKEN_SKEW_MS),
    };
    return value;
  }
}

function failure(what: string, res: Response): Promise<Error> {
  return httpFailure(res, 200, (detail) =>
    `Spotify ${what} failed: ${res.status} ${detail}`.trim(),
  );
}
