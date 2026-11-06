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

export interface EmailAdapter {
  sendMagicLink(input: { to: string; link: string }): Promise<void>;
  sendCalendarInvite(input: CalendarInviteInput): Promise<void>;
}
