import type {
  BuildAuthUrlInput,
  ExchangeCodeResult,
  GoogleOAuthAdapter,
  GoogleProfile,
  RefreshResult,
} from "./google-oauth.adapter.js";

const CODE_PREFIX = "fake-code:";

export class FakeGoogleOAuthAdapter implements GoogleOAuthAdapter {
  private codes = new Map<string, GoogleProfile>();
  private refreshTokens = new Map<string, GoogleProfile>();
  private counter = 0;

  buildAuthUrl(input: BuildAuthUrlInput): string {
    const params = new URLSearchParams({
      redirect_uri: input.redirectUri,
      state: input.state,
      scope: (input.scopes ?? ["openid", "email", "profile"]).join(" "),
      access_type: input.offline ? "offline" : "online",
    });
    return `https://fake-accounts.google.test/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ExchangeCodeResult> {
    let profile = this.codes.get(input.code);
    // Unseeded codes of the form "fake-code:<email>" derive a profile from the email.
    if (!profile && input.code.startsWith(CODE_PREFIX)) {
      const email = input.code.slice(CODE_PREFIX.length);
      if (email.includes("@")) profile = this.profileFor(email);
    }
    if (!profile) return { status: "invalid-code" };
    this.codes.delete(input.code);
    const n = ++this.counter;
    const refreshToken = `fake-refresh-${n}`;
    this.refreshTokens.set(refreshToken, profile);
    return {
      status: "ok",
      profile,
      tokens: {
        accessToken: `fake-access-${n}`,
        refreshToken,
        expiresAt: this.expiry(),
        scopes: ["openid", "email", "profile"],
      },
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
    if (!this.refreshTokens.has(refreshToken))
      return { status: "invalid-grant" };
    return {
      status: "ok",
      accessToken: `fake-access-${++this.counter}`,
      expiresAt: this.expiry(),
    };
  }

  // ---- test controls ----

  /** Registers a one-time code that exchanges to the given profile. */
  issueCode(profile: Partial<GoogleProfile> & { email: string }): string {
    const code = `fake-code-seeded-${++this.counter}`;
    this.codes.set(code, { ...this.profileFor(profile.email), ...profile });
    return code;
  }

  revokeRefreshToken(refreshToken: string): void {
    this.refreshTokens.delete(refreshToken);
  }

  reset(): void {
    this.codes.clear();
    this.refreshTokens.clear();
    this.counter = 0;
  }

  private profileFor(email: string): GoogleProfile {
    const local = email.split("@")[0] ?? email;
    return { sub: `fake-sub-${local}`, email, name: local, picture: null };
  }

  private expiry(): string {
    return new Date(Date.UTC(2030, 0, 1)).toISOString();
  }
}
