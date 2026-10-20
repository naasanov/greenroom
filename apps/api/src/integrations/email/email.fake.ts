import type { EmailAdapter } from "./email.adapter.js";

export interface SentMagicLink {
  to: string;
  link: string;
}

export class FakeEmailAdapter implements EmailAdapter {
  private sent: SentMagicLink[] = [];

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
  }
}
