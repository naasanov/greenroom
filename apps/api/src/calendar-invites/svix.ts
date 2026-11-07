import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 300;

export interface SvixHeaders {
  id?: string;
  timestamp?: string;
  signature?: string;
}

/**
 * Verifies a Svix-signed webhook (the scheme Resend uses): HMAC-SHA256 over
 * `id.timestamp.body` with the base64 secret after `whsec_`, compared against each
 * `v1,<base64>` entry of the signature header, within a five minute window.
 */
export function verifySvix(
  secret: string | undefined,
  rawBody: Buffer | string | undefined,
  h: SvixHeaders,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (
    !secret ||
    rawBody === undefined ||
    !h.id ||
    !h.timestamp ||
    !h.signature
  ) {
    return false;
  }
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) {
    return false;
  }
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const want = createHmac("sha256", key)
    .update(`${h.id}.${h.timestamp}.${body}`)
    .digest();
  return h.signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === want.length && timingSafeEqual(given, want);
  });
}
