import type { CalendarInviteInput, EmailAdapter } from "./email.adapter.js";

export interface SentMagicLink {
  to: string;
  link: string;
}

export type SentCalendarInvite = CalendarInviteInput & { sentAt: string };

export class FakeEmailAdapter implements EmailAdapter {
  private sent: SentMagicLink[] = [];
  private invites: SentCalendarInvite[] = [];

  async sendCalendarInvite(input: CalendarInviteInput): Promise<void> {
    this.invites.push({ ...input, sentAt: new Date().toISOString() });
  }

  sentCalendarInvites(): SentCalendarInvite[] {
    return this.invites.map((i) => ({ ...i }));
  }

  clearCalendarInvites(): void {
    this.invites = [];
  }

  async sendMagicLink(input: { to: string; link: string }): Promise<void> {
    this.sent.push({ ...input });
  }

  // ---- test controls ----

  sentMagicLinks(): SentMagicLink[] {
    return this.sent.map((s) => ({ ...s }));
  }

  lastMagicLinkFor(email: string): string | undefined {
    return this.sent.filter((s) => s.to === email).at(-1)?.link;
  }

  reset(): void {
    this.sent = [];
    this.invites = [];
  }
}
