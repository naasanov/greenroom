import { notImplemented } from "../not-implemented.js";
import {
  parseSpotifyId,
  type SpotifyAdapter,
  type SpotifyCreatePlaylistResult,
  type SpotifyPlaylistResult,
  type SpotifyTrack,
  type SpotifyTrackResult,
  type SpotifyWriteResult,
} from "./spotify.adapter.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
const TIMEOUT_MS = 8000;
const TOKEN_SKEW_MS = 60_000;
const MAX_RETRY_WAIT_MS = 5000;
const SEARCH_MAX = 50;

const ni53 = <T>(): Promise<T> => notImplemented("Spotify", "5.3");

const TRACK_FIELDS =
  "track(id,uri,type,is_local,name,duration_ms,external_urls.spotify,artists(name),album(name,images))";

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

/** Spotify Web API reads using client-credentials (app-level) auth. */
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

  async getPublicPlaylist(idOrUrl: string): Promise<SpotifyPlaylistResult> {
    const id = parseSpotifyId(idOrUrl);
    if (!id) return { status: "not-found-or-private" };
    const fields = encodeURIComponent(
      `id,name,external_urls.spotify,tracks.next,tracks.items(${TRACK_FIELDS})`,
    );
    const first = await this.api(
      `/playlists/${encodeURIComponent(id)}?fields=${fields}`,
    );
    if ([400, 403, 404].includes(first.status)) {
      return { status: "not-found-or-private" };
    }
    if (!first.ok) throw await failure("playlist lookup", first);
    const head: unknown = await first.json();
    if (!isObj(head)) return { status: "not-found-or-private" };

    const tracks: SpotifyTrack[] = [];
    const collect = (page: unknown) => {
      if (!isObj(page) || !Array.isArray(page.items)) return;
      for (const item of page.items) {
        const t = isObj(item) ? mapTrack(item.track) : null;
        if (t) tracks.push(t);
      }
    };
    const firstTracks = isObj(head.tracks) ? head.tracks : {};
    collect(firstTracks);

    let next = str(firstTracks.next);
    while (next) {
      const url = new URL(next);
      url.searchParams.set("fields", `next,items(${TRACK_FIELDS})`);
      const res = await this.api(url.toString());
      if (!res.ok) throw await failure("playlist page", res);
      const page: unknown = await res.json();
      collect(page);
      next = isObj(page) ? str(page.next) : null;
    }

    const ext = isObj(head.external_urls) ? head.external_urls : {};
    return {
      status: "ok",
      playlist: {
        id: str(head.id) ?? id,
        url: str(ext.spotify) ?? `https://open.spotify.com/playlist/${id}`,
        name: str(head.name) ?? "",
        tracks,
      },
    };
  }

  createPlaylist(): Promise<SpotifyCreatePlaylistResult> {
    return ni53();
  }
  addTracksToPlaylist(): Promise<SpotifyWriteResult> {
    return ni53();
  }
  getPrivatePlaylist(): Promise<SpotifyPlaylistResult> {
    return ni53();
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
