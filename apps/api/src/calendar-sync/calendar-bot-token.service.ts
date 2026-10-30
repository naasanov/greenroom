import { createSign } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";

const SCOPE = "https://www.googleapis.com/auth/calendar";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const EXPIRY_SKEW_MS = 60 * 1000;
const JWT_LIFETIME_S = 3600;
/** Fake calendar adapters ignore the token, so fake mode needs no credentials. */
const FAKE_TOKEN = "fake-calendar-bot-token";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const b64url = (v: string | Buffer): string =>
  Buffer.from(v).toString("base64url");

/**
 * Access tokens for the Google service account that owns every band calendar.
 * Signs an RS256 JWT from `CALENDAR_SA_KEY` (base64 of the JSON key) and exchanges
 * it for a token, cached until 60s before expiry with one shared in-flight request.
 */
@Injectable()
export class CalendarBotTokenService {
  private readonly log = new Logger(CalendarBotTokenService.name);
  private cached: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string | null> | null = null;

  /** Null when the key is missing, malformed or rejected by Google. */
  getAccessToken(): Promise<string | null> {
    if (process.env.INTEGRATIONS_MODE === "fake") {
      return Promise.resolve(FAKE_TOKEN);
    }
    if (this.cached && this.cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
      return Promise.resolve(this.cached.token);
    }
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<string | null> {
    const key = this.readKey();
    if (!key) return null;
    try {
      const res = await fetch(key.token_uri ?? DEFAULT_TOKEN_URI, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: this.signJwt(key),
        }),
      });
      if (!res.ok) {
        this.cached = null;
        this.log.warn(`Calendar service account token request ${res.status}`);
        return null;
      }
      const body = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (!body.access_token) return null;
      this.cached = {
        token: body.access_token,
        expiresAt: Date.now() + (body.expires_in ?? JWT_LIFETIME_S) * 1000,
      };
      return body.access_token;
    } catch (err) {
      this.cached = null;
      this.log.warn(
        `Calendar service account token failed: ${err instanceof Error ? err.name : "error"}`,
      );
      return null;
    }
  }

  private readKey(): ServiceAccountKey | null {
    const raw = process.env.CALENDAR_SA_KEY;
    if (!raw) return null;
    try {
      const key = JSON.parse(
        Buffer.from(raw, "base64").toString(),
      ) as Partial<ServiceAccountKey>;
      if (!key.client_email || !key.private_key) return null;
      return key as ServiceAccountKey;
    } catch {
      this.log.warn("CALENDAR_SA_KEY is not base64 service account JSON");
      return null;
    }
  }

  private signJwt(key: ServiceAccountKey): string {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = [
      b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
      b64url(
        JSON.stringify({
          iss: key.client_email,
          scope: SCOPE,
          aud: key.token_uri ?? DEFAULT_TOKEN_URI,
          iat: now,
          exp: now + JWT_LIFETIME_S,
        }),
      ),
    ].join(".");
    const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
    return `${unsigned}.${b64url(sig)}`;
  }
}
