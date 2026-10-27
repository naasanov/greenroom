import type {
  BuildAuthUrlInput,
  ExchangeCodeResult,
  GoogleOAuthAdapter,
  RefreshResult,
} from "./google-oauth.adapter.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DEFAULT_SCOPES = ["openid", "email", "profile"];

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
}

interface UserInfo {
  sub?: string;
  email?: string;
  name?: string;
  picture?: string;
}

const clientId = (): string => {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set");
  return v;
};
const clientSecret = (): string => {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set");
  return v;
};

const expiry = (expiresIn: number | undefined): string =>
  new Date(Date.now() + (expiresIn ?? 3600) * 1000).toISOString();

async function postToken(
  params: Record<string, string>,
): Promise<{ ok: boolean; status: number; body: TokenResponse }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      ...params,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  return { ok: res.ok, status: res.status, body };
}

export class RealGoogleOAuthAdapter implements GoogleOAuthAdapter {
  buildAuthUrl(input: BuildAuthUrlInput): string {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: (input.scopes ?? DEFAULT_SCOPES).join(" "),
      state: input.state,
      access_type: input.offline ? "offline" : "online",
    });
    if (input.prompt) params.set("prompt", input.prompt);
    if (input.includeGrantedScopes !== undefined)
      params.set("include_granted_scopes", String(input.includeGrantedScopes));
    if (input.loginHint) params.set("login_hint", input.loginHint);
    return `${AUTH_URL}?${params}`;
  }

  async exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ExchangeCodeResult> {
    const res = await postToken({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
    });
    if (!res.ok || !res.body.access_token) {
      // 4xx means the code itself was rejected; anything else is an outage.
      if (res.status >= 400 && res.status < 500)
        return { status: "invalid-code" };
      throw new Error(`Google token exchange failed (${res.status})`);
    }
    const info = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${res.body.access_token}` },
    });
    if (!info.ok) throw new Error(`Google userinfo failed (${info.status})`);
    const user = (await info.json()) as UserInfo;
    if (!user.sub || !user.email)
      throw new Error("Google userinfo missing sub or email");
    return {
      status: "ok",
      tokens: {
        accessToken: res.body.access_token,
        refreshToken: res.body.refresh_token ?? null,
        expiresAt: expiry(res.body.expires_in),
        scopes: (res.body.scope ?? "").split(" ").filter(Boolean),
      },
      profile: {
        sub: user.sub,
        email: user.email,
        name: user.name ?? user.email,
        picture: user.picture ?? null,
      },
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
    const res = await postToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    if (res.body.error === "invalid_grant") return { status: "invalid-grant" };
    if (!res.ok || !res.body.access_token)
      throw new Error(`Google token refresh failed (${res.status})`);
    return {
      status: "ok",
      accessToken: res.body.access_token,
      expiresAt: expiry(res.body.expires_in),
    };
  }

  async revokeToken(token: string): Promise<void> {
    try {
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token }),
      });
    } catch {
      // Best effort.
    }
  }
}
