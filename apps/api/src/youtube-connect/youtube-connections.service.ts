import { createHash, randomBytes } from "node:crypto";
import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { oauthConnections, oauthStates, type Database } from "@greenroom/db";
import {
  YOUTUBE_ERROR_CODES,
  YOUTUBE_SCOPE,
  type YoutubeStatus,
} from "@greenroom/shared";
import { apiPublicUrl } from "../auth/auth.constants.js";
import { decryptToken, encryptToken } from "../common/token-crypto.js";
import { DRIZZLE } from "../db/db.constants.js";
import {
  GOOGLE_OAUTH,
  type GoogleOAuthAdapter,
} from "../integrations/index.js";

const STATE_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;
const PROVIDER = "youtube" as const;
// openid and email identify the account; the youtube scope is the grant that matters.
const SCOPES = ["openid", "email", YOUTUBE_SCOPE];

const sha256 = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

export const youtubeRedirectUri = (): string =>
  `${apiPublicUrl()}/integrations/youtube/callback`;

export type CompleteResult =
  { ok: true; redirectTo: string } | { ok: false; redirectTo: string | null };

@Injectable()
export class YoutubeConnectionsService {
  private readonly log = new Logger(YoutubeConnectionsService.name);
  private refreshing = new Map<string, Promise<string | null>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthAdapter,
  ) {}

  async status(userId: string): Promise<YoutubeStatus> {
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
    return this.google.buildAuthUrl({
      redirectUri: youtubeRedirectUri(),
      state,
      scopes: SCOPES,
      offline: true,
      prompt: "consent",
      includeGrantedScopes: false,
    });
  }

  /** A usable token for playlist writes; a missing or revoked connection asks to connect. */
  async getExportToken(userId: string): Promise<string> {
    const row = await this.find(userId);
    const token = row ? await this.getAccessToken(userId) : null;
    if (!row || !token || !row.scopes.includes(YOUTUBE_SCOPE)) {
      throw this.loginRequired();
    }
    return token;
  }

  loginRequired(): ConflictException {
    return new ConflictException({
      code: YOUTUBE_ERROR_CODES.loginRequired,
      message: "Connect YouTube to save playlists",
    });
  }

  /** Consumes the state; `code` null means the user denied or Google errored. */
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
    const fail = { ok: false, redirectTo: row.redirectTo } as const;
    if (!code) return fail;

    let res;
    try {
      res = await this.google.exchangeCode({
        code,
        redirectUri: youtubeRedirectUri(),
        state,
      });
    } catch (err) {
      this.log.error(
        `youtube code exchange failed: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      return fail;
    }
    if (res.status !== "ok") {
      this.log.warn(`youtube code exchange rejected status=${res.status}`);
      return fail;
    }
    const { tokens, profile } = res;
    // Google's granular consent lets the user untick the YouTube permission.
    if (!tokens.scopes.includes(YOUTUBE_SCOPE)) {
      if (tokens.refreshToken)
        await this.google.revokeToken(tokens.refreshToken);
      return fail;
    }
    if (!tokens.refreshToken) return fail;

    const values = {
      scopes: tokens.scopes,
      refreshTokenEncrypted: encryptToken(tokens.refreshToken),
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      accessTokenExpiresAt: new Date(tokens.expiresAt),
      externalUserId: profile.sub,
      externalDisplayName: profile.email,
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

  /** Revokes the refresh token (best effort) and deletes the connection; idempotent. */
  async disconnect(userId: string): Promise<void> {
    const row = await this.find(userId);
    if (row) {
      try {
        await this.google.revokeToken(decryptToken(row.refreshTokenEncrypted));
      } catch (err) {
        this.log.warn(
          `youtube token revoke failed user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    await this.remove(userId);
  }

  /**
   * A usable access token, refreshing when near expiry. Null means the user is
   * not connected (including when Google revoked the grant, which also removes the row).
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
    const res = await this.google.refreshAccessToken(
      decryptToken(row.refreshTokenEncrypted),
    );
    if (res.status === "invalid-grant") {
      this.log.warn(
        `youtube refresh token revoked, disconnecting user=${userId}`,
      );
      await this.remove(userId);
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

  private async remove(userId: string): Promise<void> {
    await this.db
      .delete(oauthConnections)
      .where(
        and(
          eq(oauthConnections.userId, userId),
          eq(oauthConnections.provider, PROVIDER),
        ),
      );
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
