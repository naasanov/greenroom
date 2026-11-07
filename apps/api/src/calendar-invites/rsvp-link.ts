import { createHmac, timingSafeEqual } from "node:crypto";
import { apiPublicUrl } from "../auth/auth.constants.js";
import { toOccurrenceKey } from "../events/time.js";
import { inviteSecret } from "./reply-token.js";

export const RSVP_LINK_RESPONSES = ["going", "maybe", "no"] as const;
export type RsvpLinkResponse = (typeof RSVP_LINK_RESPONSES)[number];
export type RsvpLinks = Record<RsvpLinkResponse, string>;

const TTL_DAYS = 120;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RsvpLinkClaims {
  userId: string;
  seriesId: string;
  /** Occurrence key for a single-occurrence link; absent means the whole series. */
  occurrence?: string;
  /** Expiry in epoch seconds. */
  exp: number;
}

const mac = (body: string): string =>
  createHmac("sha256", `rsvp-link:${inviteSecret()}`)
    .update(body)
    .digest("base64url");

/** Signed, stateless token: base64url(user|series|occurrence|exp) + "." + HMAC. */
export function signRsvpToken(
  c: Omit<RsvpLinkClaims, "exp"> & { exp?: number },
): string {
  const exp = c.exp ?? Math.floor(Date.now() / 1000) + TTL_DAYS * 86_400;
  const body = Buffer.from(
    `${c.userId}|${c.seriesId}|${c.occurrence ?? ""}|${exp}`,
  ).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The claims of a token, or null when malformed or forged. Expiry is checked by the caller. */
export function verifyRsvpToken(token: string): RsvpLinkClaims | null {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || token.length > 400) return null;
  const given = Buffer.from(sig);
  const want = Buffer.from(mac(body));
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }
  const [userId, seriesId, occurrence, exp] = Buffer.from(body, "base64url")
    .toString("utf8")
    .split("|");
  const expNum = Number(exp);
  if (
    !userId ||
    !seriesId ||
    !UUID_RE.test(userId) ||
    !UUID_RE.test(seriesId)
  ) {
    return null;
  }
  if (!Number.isFinite(expNum)) return null;
  return {
    userId,
    seriesId,
    ...(occurrence ? { occurrence } : {}),
    exp: expNum,
  };
}

/** Public API URLs behind the three answer links in an invite email. */
export function rsvpLinkUrls(
  c: { userId: string; seriesId: string },
  occurrence?: Date,
): RsvpLinks {
  const token = signRsvpToken({
    ...c,
    ...(occurrence ? { occurrence: toOccurrenceKey(occurrence) } : {}),
  });
  const base = `${apiPublicUrl()}/public/rsvp/${token}`;
  return {
    going: `${base}?response=going`,
    maybe: `${base}?response=maybe`,
    no: `${base}?response=no`,
  };
}
