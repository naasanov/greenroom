export const GOOGLE_OAUTH = Symbol("GOOGLE_OAUTH");

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  scopes: string[];
}

export interface BuildAuthUrlInput {
  redirectUri: string;
  state: string;
  scopes?: string[];
  /** Request offline access so a refresh token is returned. */
  offline?: boolean;
  /** Space-separated Google `prompt` values, e.g. "consent select_account". */
  prompt?: string;
  /** Google `include_granted_scopes`; incremental authorization when true. */
  includeGrantedScopes?: boolean;
  loginHint?: string;
}

export type ExchangeCodeResult =
  | { status: "ok"; tokens: GoogleTokens; profile: GoogleProfile }
  | { status: "invalid-code" };

export type RefreshResult =
  | {
      status: "ok";
      accessToken: string;
      expiresAt: string;
      /** Present only when Google rotates the refresh token. */
      refreshToken?: string;
    }
  | { status: "invalid-grant" };

export interface GoogleOAuthAdapter {
  buildAuthUrl(input: BuildAuthUrlInput): string;
  /** `state` is optional context the fake uses to report the requested scopes. */
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    state?: string;
  }): Promise<ExchangeCodeResult>;
  refreshAccessToken(refreshToken: string): Promise<RefreshResult>;
  /** Best-effort revocation of a refresh or access token; never throws. */
  revokeToken(token: string): Promise<void>;
}
