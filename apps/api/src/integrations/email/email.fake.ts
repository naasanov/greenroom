import type {
  CalendarInviteInput,
  EmailAdapter,
  ReceivedEmail,
} from "./email.adapter.js";

export interface SentMagicLink {
  to: string;
  link: string;
}

export type SentCalendarInvite = CalendarInviteInput & { sentAt: string };

export class FakeEmailAdapter implements EmailAdapter {
  private sent: SentMagicLink[] = [];
  private invites: SentCalendarInvite[] = [];
  private received = new Map<string, ReceivedEmail>();

  async sendCalendarInvite(input: CalendarInviteInput): Promise<void> {
    this.invites.push({ ...input, sentAt: new Date().toISOString() });
  }

  async fetchReceivedEmail(emailId: string): Promise<ReceivedEmail | null> {
    return this.received.get(emailId) ?? null;
  }

  /** Test control: stores an inbound message the webhook handler can fetch by id. */
  addReceivedEmail(emailId: string, email: ReceivedEmail): void {
    this.received.set(emailId, email);
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
    this.received.clear();
  }
}
