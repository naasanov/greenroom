export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const GOOGLE_STATE_COOKIE = "gr_oauth_state";
export const IS_PUBLIC_KEY = "isPublic";

export const sessionCookieName = (): string =>
  process.env.SESSION_COOKIE_NAME || "gr_session";
export const webUrl = (): string =>
  (process.env.WEB_URL || "http://localhost:3000").replace(/\/$/, "");
export const apiPublicUrl = (): string =>
  (
    process.env.API_PUBLIC_URL ||
    `http://localhost:${process.env.API_PORT ?? 4000}`
  ).replace(/\/$/, "");
