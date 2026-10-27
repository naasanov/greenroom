import {
  parseSpotifyId,
  type SpotifyAdapter,
  type SpotifyCreatePlaylistResult,
  type SpotifyExchangeResult,
  type SpotifyPlaylistResult,
  type SpotifyRefreshResult,
  type SpotifyTrack,
  type SpotifyTrackResult,
  type SpotifyWriteResult,
} from "./spotify.adapter.js";

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const TIMEOUT_MS = 8000;
const TOKEN_SKEW_MS = 60_000;
const MAX_RETRY_WAIT_MS = 5000;
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
  if ([400, 403, 404].includes(status)) {
    return { status: "not-found-or-private" };
  }
  return null;
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

    const me = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
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
    const head = await this.userGet(
      userToken,
      `/playlists/${enc}?fields=id,name,external_urls.spotify`,
    );
    const miss = playlistMiss(head.status);
    if (miss) return miss;
    if (!head.ok) throw await failure("playlist lookup", head);
    const meta: unknown = await head.json();
    if (!isObj(meta)) return { status: "not-found-or-private" };

    const tracks: SpotifyTrack[] = [];
    let next: string | null = `${API_URL}/playlists/${enc}/items?limit=100`;
    while (next) {
      const res = await this.userGet(userToken, next);
      const pageMiss = playlistMiss(res.status);
      if (pageMiss) return pageMiss;
      if (!res.ok) throw await failure("playlist page", res);
      const page: unknown = await res.json();
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

  private tokenRequest(form: Record<string, string>): Promise<Response> {
    const id = process.env.SPOTIFY_CLIENT_ID;
    const secret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!id || !secret) {
      throw new Error(
        "Spotify credentials missing: set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET",
      );
    }
    return fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  /** JSON write with a user token; retries once on 429. */
  private async userSend(
    userToken: string,
    method: "POST",
    path: string,
    body: unknown,
  ): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(API_URL + path, {
        method,
        headers: {
          Authorization: `Bearer ${userToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status !== 429 || attempt > 0) return res;
      const secs = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(secs) ? secs * 1000 : 1000;
      await new Promise((r) =>
        setTimeout(r, Math.min(MAX_RETRY_WAIT_MS, Math.max(0, wait))),
      );
    }
  }

  /** GET with a user token; retries once on 429. */
  private async userGet(
    userToken: string,
    pathOrUrl: string,
  ): Promise<Response> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : API_URL + pathOrUrl;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${userToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status !== 429 || attempt > 0) return res;
      const secs = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(secs) ? secs * 1000 : 1000;
      await new Promise((r) =>
        setTimeout(r, Math.min(MAX_RETRY_WAIT_MS, Math.max(0, wait))),
      );
    }
  }

  /** GET with bearer auth; retries once on 401 (fresh token) and on 429. */
  private async api(pathOrUrl: string): Promise<Response> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : API_URL + pathOrUrl;
    let retried401 = false;
    let retried429 = false;
    for (;;) {
      const token = await this.getToken();
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 401 && !retried401) {
        retried401 = true;
        this.token = null;
        continue;
      }
      if (res.status === 429 && !retried429) {
        retried429 = true;
        const secs = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(secs) ? secs * 1000 : 1000;
        await new Promise((r) =>
          setTimeout(r, Math.min(MAX_RETRY_WAIT_MS, Math.max(0, wait))),
        );
        continue;
      }
      return res;
    }
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
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
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

async function failure(what: string, res: Response): Promise<Error> {
  let detail = "";
  try {
    detail = (await res.text()).slice(0, 200);
  } catch {
    // Body is best-effort context only.
  }
  return new Error(`Spotify ${what} failed: ${res.status} ${detail}`.trim());
}
