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
}

export type ExchangeCodeResult =
  | { status: "ok"; tokens: GoogleTokens; profile: GoogleProfile }
  | { status: "invalid-code" };

export type RefreshResult =
  | { status: "ok"; accessToken: string; expiresAt: string }
  | { status: "invalid-grant" };

export interface GoogleOAuthAdapter {
  buildAuthUrl(input: BuildAuthUrlInput): string;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<ExchangeCodeResult>;
  refreshAccessToken(refreshToken: string): Promise<RefreshResult>;
}
