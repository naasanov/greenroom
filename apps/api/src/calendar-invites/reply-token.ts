import { createHmac, timingSafeEqual } from "node:crypto";

export type InviteKind = "gig" | "series";

const KIND_CHAR: Record<InviteKind, string> = { gig: "g", series: "p" };
const MAC_HEX = 20;

export const replyDomain = (): string =>
  process.env.EMAIL_REPLY_DOMAIN || "greenroom.fyi";

/** Server secret shared by the reply token and the signed RSVP links. */
export function inviteSecret(): string {
  const s = process.env.INVITE_TOKEN_SECRET || process.env.OAUTH_TOKEN_KEY;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("INVITE_TOKEN_SECRET or OAUTH_TOKEN_KEY is required");
  }
  return "greenroom-dev-invite-token-secret";
}

const mac = (payload: string): string =>
  createHmac("sha256", `calendar-invite-reply:${inviteSecret()}`)
    .update(payload)
    .digest("hex")
    .slice(0, MAC_HEX);

/** Stateless opaque token: kind char + event uuid hex + truncated HMAC, all lowercase hex-safe. */
export function inviteToken(kind: InviteKind, eventId: string): string {
  const payload = KIND_CHAR[kind] + eventId.replace(/-/g, "").toLowerCase();
  return payload + mac(payload);
}

/** The event a reply token names, or null when malformed or forged. */
export function parseInviteToken(
  token: string,
): { kind: InviteKind; eventId: string } | null {
  const t = token.toLowerCase();
  if (!/^[gp][0-9a-f]{32}[0-9a-f]{20}$/.test(t)) return null;
  const payload = t.slice(0, 33);
  const given = Buffer.from(t.slice(33));
  const want = Buffer.from(mac(payload));
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    return null;
  }
  const h = payload.slice(1);
  return {
    kind: payload[0] === "g" ? "gig" : "series",
    eventId: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`,
  };
}

/** Stable local part of the From address on invite emails, so mail apps see one sender. */
export const INVITES_LOCAL_PART = "invites";

/** Per-event reply address used as ORGANIZER: `rsvp+<token>@<domain>`. */
export const replyAddress = (kind: InviteKind, eventId: string): string =>
  `rsvp+${inviteToken(kind, eventId)}@${replyDomain()}`;

/** Token from a reply address, or null when it is not an rsvp+ address on the reply domain. */
export function tokenFromAddress(address: string): string | null {
  const m = /^rsvp\+([gp][0-9a-f]+)@(.+)$/i.exec(address.trim());
  return m && m[2]!.toLowerCase() === replyDomain().toLowerCase()
    ? m[1]!
    : null;
}
