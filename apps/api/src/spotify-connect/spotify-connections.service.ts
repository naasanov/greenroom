import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { oauthConnections, oauthStates, type Database } from "@greenroom/db";
import { apiPublicUrl } from "../auth/auth.constants.js";
import { decryptToken, encryptToken } from "../common/token-crypto.js";
import { DRIZZLE } from "../db/db.constants.js";
import {
  SPOTIFY,
  SPOTIFY_IMPORT_SCOPES,
  type SpotifyAdapter,
} from "../integrations/index.js";

const STATE_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;
const PROVIDER = "spotify" as const;

const sha256 = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

/** Spotify rejects `localhost` redirect URIs, so loopback uses 127.0.0.1. */
export function spotifyRedirectUri(): string {
  const url = new URL(`${apiPublicUrl()}/integrations/spotify/callback`);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.toString();
}

export type CompleteResult =
  { ok: true; redirectTo: string } | { ok: false; redirectTo: string | null };

@Injectable()
export class SpotifyConnectionsService {
  private refreshing = new Map<string, Promise<string | null>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SPOTIFY) private readonly spotify: SpotifyAdapter,
  ) {}

  async status(
    userId: string,
  ): Promise<{ connected: boolean; displayName: string | null }> {
    const row = await this.find(userId);
    return {
      connected: !!row,
      displayName: row?.externalDisplayName ?? null,
    };
  }

  /** Stores a single-use state bound to the user and returns the authorize URL. */
  async start(userId: string, redirectTo: string): Promise<string> {
    const state = randomBytes(32).toString("base64url");
    await this.db.insert(oauthStates).values({
      stateHash: sha256(state),
      userId,
      provider: PROVIDER,
      redirectTo,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    return this.spotify.buildAuthUrl({
      redirectUri: spotifyRedirectUri(),
      state,
      scopes: SPOTIFY_IMPORT_SCOPES,
    });
  }

  /** Consumes the state; `code` null means the user denied or Spotify errored. */
  async complete(
    code: string | null,
    state: string | null,
  ): Promise<CompleteResult> {
    if (!state) return { ok: false, redirectTo: null };
    const [row] = await this.db
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.stateHash, sha256(state)),
          eq(oauthStates.provider, PROVIDER),
        ),
      )
      .returning();
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return { ok: false, redirectTo: null };
    }
    if (!code) return { ok: false, redirectTo: row.redirectTo };
    const res = await this.spotify.exchangeCode({
      code,
      redirectUri: spotifyRedirectUri(),
    });
    if (res.status !== "ok") return { ok: false, redirectTo: row.redirectTo };
    const { tokens, profile } = res;
    const values = {
      scopes: tokens.scopes,
      refreshTokenEncrypted: encryptToken(tokens.refreshToken),
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      accessTokenExpiresAt: new Date(tokens.expiresAt),
      externalUserId: profile.id,
      externalDisplayName: profile.displayName,
    };
    await this.db
      .insert(oauthConnections)
      .values({ userId: row.userId, provider: PROVIDER, ...values })
      .onConflictDoUpdate({
        target: [oauthConnections.userId, oauthConnections.provider],
        set: { ...values, updatedAt: new Date() },
      });
    return { ok: true, redirectTo: row.redirectTo };
  }

  async disconnect(userId: string): Promise<void> {
    await this.db
      .delete(oauthConnections)
      .where(
        and(
          eq(oauthConnections.userId, userId),
          eq(oauthConnections.provider, PROVIDER),
        ),
      );
  }

  /**
   * A usable access token, refreshing when near expiry. Null means the user is
   * not connected (including when Spotify revoked the grant, which also removes the row).
   */
  getAccessToken(userId: string): Promise<string | null> {
    const pending =
      this.refreshing.get(userId) ??
      this.resolveToken(userId).finally(() => this.refreshing.delete(userId));
    this.refreshing.set(userId, pending);
    return pending;
  }

  private async resolveToken(userId: string): Promise<string | null> {
    const row = await this.find(userId);
    if (!row) return null;
    const exp = row.accessTokenExpiresAt?.getTime() ?? 0;
    if (row.accessTokenEncrypted && exp - EXPIRY_SKEW_MS > Date.now()) {
      return decryptToken(row.accessTokenEncrypted);
    }
    const res = await this.spotify.refreshAccessToken(
      decryptToken(row.refreshTokenEncrypted),
    );
    if (res.status === "invalid-grant") {
      await this.disconnect(userId);
      return null;
    }
    await this.db
      .update(oauthConnections)
      .set({
        accessTokenEncrypted: encryptToken(res.accessToken),
        accessTokenExpiresAt: new Date(res.expiresAt),
        ...(res.refreshToken
          ? { refreshTokenEncrypted: encryptToken(res.refreshToken) }
          : {}),
      })
      .where(eq(oauthConnections.id, row.id));
    return res.accessToken;
  }

  private async find(userId: string) {
    const [row] = await this.db
      .select()
      .from(oauthConnections)
      .where(
        and(
          eq(oauthConnections.userId, userId),
          eq(oauthConnections.provider, PROVIDER),
        ),
      );
    return row;
  }
}
