import { Inject, Injectable } from "@nestjs/common";
import {
  GOOGLE_OAUTH,
  type GoogleOAuthAdapter,
} from "../integrations/index.js";

const EXPIRY_SKEW_MS = 60 * 1000;
/** Fake calendar adapters ignore the token, so fake mode needs no credentials. */
const FAKE_TOKEN = "fake-calendar-bot-token";

/**
 * Access tokens for the server-held bot Google account that owns every band
 * calendar. Refreshes from `CALENDAR_BOT_REFRESH_TOKEN` shortly before expiry,
 * with concurrent callers sharing one refresh.
 */
@Injectable()
export class CalendarBotTokenService {
  private cached: { token: string; expiresAt: number } | null = null;
  private refreshing: Promise<string | null> | null = null;

  constructor(
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthAdapter,
  ) {}

  /** Null when the bot refresh token is missing or Google rejected it. */
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
    const refreshToken = process.env.CALENDAR_BOT_REFRESH_TOKEN;
    if (!refreshToken) return null;
    const res = await this.google.refreshAccessToken(refreshToken);
    if (res.status === "invalid-grant") {
      this.cached = null;
      return null;
    }
    this.cached = {
      token: res.accessToken,
      expiresAt: Date.parse(res.expiresAt),
    };
    return res.accessToken;
  }
}
