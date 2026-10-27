import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  bandGoogleLinks,
  bands,
  oauthStates,
  users,
  type Database,
} from "@greenroom/db";
import {
  GOOGLE_SERVICE_SCOPES,
  type GoogleIntegrations,
  type GoogleLinkErrorReason,
  type GoogleService,
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
const PROVIDER = "google" as const;

const sha256 = (s: string): string =>
  createHash("sha256").update(s).digest("hex");

export const googleLinkRedirectUri = (): string =>
  `${apiPublicUrl()}/integrations/google/callback`;

export type GoogleLinkRow = typeof bandGoogleLinks.$inferSelect;

export type LinkCompleteResult =
  | { ok: true; redirectTo: string; service: GoogleService }
  | {
      ok: false;
      reason: GoogleLinkErrorReason;
      /** Null when the state was unknown, so the return path cannot be trusted. */
      redirectTo: string | null;
      service: GoogleService | null;
    };

@Injectable()
export class GoogleLinksService {
  private refreshing = new Map<string, Promise<string | null>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthAdapter,
  ) {}

  async status(bandId: string): Promise<GoogleIntegrations> {
    const rows = await this.db
      .select({
        link: bandGoogleLinks,
        displayName: users.displayName,
      })
      .from(bandGoogleLinks)
      .leftJoin(users, eq(users.id, bandGoogleLinks.linkedByUserId))
      .where(eq(bandGoogleLinks.bandId, bandId));
    const [band] = await this.db
      .select({
        folderId: bands.driveRootFolderId,
        calendarId: bands.calendarId,
      })
      .from(bands)
      .where(eq(bands.id, bandId));
    const of = (service: GoogleService) => {
      const row = rows.find((r) => r.link.service === service);
      return {
        linked: !!row,
        email: row?.link.googleEmail ?? null,
        linkedBy:
          row?.link.linkedByUserId && row.displayName
            ? { userId: row.link.linkedByUserId, displayName: row.displayName }
            : null,
        linkedAt: row?.link.updatedAt.toISOString() ?? null,
      };
    };
    return {
      drive: { ...of("drive"), folderId: band?.folderId ?? null },
      calendar: { ...of("calendar"), calendarId: band?.calendarId ?? null },
    };
  }

  /** Stores a single-use state bound to the user, band and service; returns the authorize URL. */
  async start(
    userId: string,
    bandId: string,
    service: GoogleService,
    redirectTo: string,
  ): Promise<string> {
    const state = randomBytes(32).toString("base64url");
    await this.db.insert(oauthStates).values({
      stateHash: sha256(state),
      userId,
      provider: PROVIDER,
      bandId,
      purpose: service,
      redirectTo,
      expiresAt: new Date(Date.now() + STATE_TTL_MS),
    });
    return this.google.buildAuthUrl({
      redirectUri: googleLinkRedirectUri(),
      state,
      scopes: ["openid", "email", GOOGLE_SERVICE_SCOPES[service]],
      offline: true,
      prompt: "consent select_account",
      includeGrantedScopes: false,
    });
  }

  /** Consumes the state; `code` null means the user denied or Google errored. */
  async complete(
    code: string | null,
    state: string | null,
    denied: boolean,
  ): Promise<LinkCompleteResult> {
    const invalid: LinkCompleteResult = {
      ok: false,
      reason: "invalid_state",
      redirectTo: null,
      service: null,
    };
    if (!state) return invalid;
    const [row] = await this.db
      .delete(oauthStates)
      .where(
        and(
          eq(oauthStates.stateHash, sha256(state)),
          eq(oauthStates.provider, PROVIDER),
        ),
      )
      .returning();
    const service = row?.purpose;
    if (
      !row ||
      !row.bandId ||
      (service !== "drive" && service !== "calendar") ||
      row.expiresAt.getTime() < Date.now()
    ) {
      return invalid;
    }
    const fail = (reason: GoogleLinkErrorReason): LinkCompleteResult => ({
      ok: false,
      reason,
      redirectTo: row.redirectTo,
      service,
    });
    if (denied) return fail("denied");
    if (!code) return fail("exchange_failed");

    let res;
    try {
      res = await this.google.exchangeCode({
        code,
        redirectUri: googleLinkRedirectUri(),
        state,
      });
    } catch {
      return fail("exchange_failed");
    }
    if (res.status !== "ok") return fail("exchange_failed");
    const { tokens, profile } = res;
    if (!tokens.scopes.includes(GOOGLE_SERVICE_SCOPES[service])) {
      if (tokens.refreshToken)
        await this.google.revokeToken(tokens.refreshToken);
      return fail("scope_denied");
    }
    if (!tokens.refreshToken) return fail("exchange_failed");

    const values = {
      googleSub: profile.sub,
      googleEmail: profile.email,
      scopes: tokens.scopes,
      refreshTokenEncrypted: encryptToken(tokens.refreshToken),
      accessTokenEncrypted: encryptToken(tokens.accessToken),
      accessTokenExpiresAt: new Date(tokens.expiresAt),
      linkedByUserId: row.userId,
    };
    await this.db
      .insert(bandGoogleLinks)
      .values({ bandId: row.bandId, service, ...values })
      .onConflictDoUpdate({
        target: [bandGoogleLinks.bandId, bandGoogleLinks.service],
        set: { ...values, updatedAt: new Date() },
      });
    await this.db
      .update(bands)
      .set(
        service === "drive"
          ? { driveLinkedByUserId: row.userId }
          : { calendarLinkedByUserId: row.userId },
      )
      .where(eq(bands.id, row.bandId));
    return { ok: true, redirectTo: row.redirectTo, service };
  }

  /** Revokes the refresh token (best effort), deletes the link and clears the band columns. */
  async disconnect(bandId: string, service: GoogleService): Promise<void> {
    const link = await this.getLink(bandId, service);
    if (link) {
      try {
        await this.google.revokeToken(decryptToken(link.refreshTokenEncrypted));
      } catch {
        // Best effort.
      }
    }
    await this.removeLink(bandId, service);
  }

  getLink(
    bandId: string,
    service: GoogleService,
  ): Promise<GoogleLinkRow | undefined> {
    return this.db
      .select()
      .from(bandGoogleLinks)
      .where(
        and(
          eq(bandGoogleLinks.bandId, bandId),
          eq(bandGoogleLinks.service, service),
        ),
      )
      .then((rows) => rows[0]);
  }

  /** Band ids with a link for the service, for background pollers. */
  async listLinkedBands(service: GoogleService): Promise<string[]> {
    const rows = await this.db
      .select({ bandId: bandGoogleLinks.bandId })
      .from(bandGoogleLinks)
      .where(eq(bandGoogleLinks.service, service));
    return rows.map((r) => r.bandId);
  }

  /**
   * A usable access token, refreshing when near expiry. Null means the band is not
   * linked (including when Google revoked the grant, which also removes the link).
   */
  getAccessToken(
    bandId: string,
    service: GoogleService,
  ): Promise<string | null> {
    const key = `${bandId}:${service}`;
    const pending =
      this.refreshing.get(key) ??
      this.resolveToken(bandId, service).finally(() =>
        this.refreshing.delete(key),
      );
    this.refreshing.set(key, pending);
    return pending;
  }

  private async resolveToken(
    bandId: string,
    service: GoogleService,
  ): Promise<string | null> {
    const row = await this.getLink(bandId, service);
    if (!row) return null;
    const exp = row.accessTokenExpiresAt?.getTime() ?? 0;
    if (row.accessTokenEncrypted && exp - EXPIRY_SKEW_MS > Date.now()) {
      return decryptToken(row.accessTokenEncrypted);
    }
    const res = await this.google.refreshAccessToken(
      decryptToken(row.refreshTokenEncrypted),
    );
    if (res.status === "invalid-grant") {
      await this.removeLink(bandId, service);
      return null;
    }
    await this.db
      .update(bandGoogleLinks)
      .set({
        accessTokenEncrypted: encryptToken(res.accessToken),
        accessTokenExpiresAt: new Date(res.expiresAt),
        ...(res.refreshToken
          ? { refreshTokenEncrypted: encryptToken(res.refreshToken) }
          : {}),
      })
      .where(eq(bandGoogleLinks.id, row.id));
    return res.accessToken;
  }

  private async removeLink(
    bandId: string,
    service: GoogleService,
  ): Promise<void> {
    await this.db
      .delete(bandGoogleLinks)
      .where(
        and(
          eq(bandGoogleLinks.bandId, bandId),
          eq(bandGoogleLinks.service, service),
        ),
      );
    await this.db
      .update(bands)
      .set(
        service === "drive"
          ? { driveRootFolderId: null, driveLinkedByUserId: null }
          : { calendarId: null, calendarLinkedByUserId: null },
      )
      .where(eq(bands.id, bandId));
  }
}
