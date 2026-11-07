export const EMAIL = Symbol("EMAIL");

export interface CalendarInviteInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Full iCalendar text (CRLF) for the METHOD below. */
  ics: string;
  method: "REQUEST" | "CANCEL";
  /** Optional From override; defaults to EMAIL_FROM. */
  from?: string;
}

/** An inbound message reduced to what the RSVP handler needs. */
export interface ReceivedEmail {
  from: string;
  /** Every recipient address (to, cc, bcc, received-for). */
  recipients: string[];
  /** Decoded text of each text/calendar part or .ics attachment. */
  calendars: string[];
  /** True when the receiver reports a failed DMARC check for the sender. */
  authFailed: boolean;
}

export interface EmailAdapter {
  sendMagicLink(input: { to: string; link: string }): Promise<void>;
  sendCalendarInvite(input: CalendarInviteInput): Promise<void>;
  /** Fetches an inbound message announced by the receiving webhook; null when unknown. */
  fetchReceivedEmail(emailId: string): Promise<ReceivedEmail | null>;
}
