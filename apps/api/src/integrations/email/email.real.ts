import { MAGIC_LINK_TTL_MS } from "../../auth/auth.constants.js";
import type {
  CalendarInviteInput,
  EmailAdapter,
  ReceivedEmail,
} from "./email.adapter.js";
import { extractCalendarParts } from "./mime.js";

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Greenroom <login@greenroom.fyi>";
const TIMEOUT_MS = 10_000;

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not set");
    this.name = "EmailNotConfiguredError";
  }
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Sends magic-link emails through the Resend HTTP API. */
export class RealEmailAdapter implements EmailAdapter {
  async sendMagicLink(input: { to: string; link: string }): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new EmailNotConfiguredError();
    const minutes = Math.round(MAGIC_LINK_TTL_MS / 60_000);
    const expiry = `This link expires in ${minutes} minutes and can be used once.`;
    await this.post(key, {
      from: process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [input.to],
      subject: "Your Greenroom sign-in link",
      text: `Sign in to Greenroom:\n\n${input.link}\n\n${expiry}\nIf you did not request this, you can ignore this email.`,
      html: `<p>Sign in to Greenroom:</p><p><a href="${escapeHtml(input.link)}">Sign in</a></p><p>${expiry}<br>If you did not request this, you can ignore this email.</p>`,
    });
  }

  /**
   * Resend has no raw MIME or alternative parts, so the invite goes as an
   * invite.ics attachment typed `text/calendar; method=...`, which Gmail,
   * Outlook and Apple Mail render as an RSVP card.
   */
  async sendCalendarInvite(input: CalendarInviteInput): Promise<void> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new EmailNotConfiguredError();
    await this.post(key, {
      from: input.from || process.env.EMAIL_FROM || DEFAULT_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: [
        {
          filename: "invite.ics",
          content: Buffer.from(input.ics, "utf8").toString("base64"),
          content_type: `text/calendar; method=${input.method}; charset=UTF-8`,
        },
      ],
    });
  }

  /**
   * The webhook carries metadata only. The message is fetched from the receiving API,
   * then its original MIME (signed download URL) is walked for text/calendar parts.
   */
  async fetchReceivedEmail(emailId: string): Promise<ReceivedEmail | null> {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new EmailNotConfiguredError();
    const res = await fetch(
      `${RESEND_URL}/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Resend received email fetch failed with ${res.status}`);
    }
    const body = (await res.json()) as {
      from?: string;
      to?: string[];
      cc?: string[];
      bcc?: string[];
      received_for?: string[];
      authentication?: { dmarc?: string } | null;
      raw?: { download_url?: string } | null;
    };
    const url = body.raw?.download_url;
    let calendars: string[] = [];
    if (url) {
      const raw = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (raw.ok) {
        calendars = extractCalendarParts(Buffer.from(await raw.arrayBuffer()));
      }
    }
    return {
      from: body.from ?? "",
      recipients: [
        ...(body.to ?? []),
        ...(body.cc ?? []),
        ...(body.bcc ?? []),
        ...(body.received_for ?? []),
      ],
      calendars,
      authFailed: body.authentication?.dmarc === "fail",
    };
  }

  private async post(key: string, payload: object): Promise<void> {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      let detail = "";
      try {
        const body = (await res.json()) as { message?: unknown };
        if (typeof body.message === "string") {
          detail = `: ${body.message.slice(0, 200)}`;
        }
      } catch {
        // non-JSON error body; status alone is reported
      }
      throw new Error(`Resend email send failed with ${res.status}${detail}`);
    }
  }
}
