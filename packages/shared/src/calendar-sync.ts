import { z } from "zod";
import { timeZoneSchema } from "./events.js";

export const CALENDAR_SYNC_ERROR_CODES = {
  botNotConfigured: "CALENDAR_BOT_NOT_CONFIGURED",
} as const;

/** Body of POST /bands/:bandId/integrations/google/calendar/setup. */
export const calendarSetupSchema = z.object({ timeZone: timeZoneSchema });
export type CalendarSetup = z.infer<typeof calendarSetupSchema>;

export interface CalendarSetupResult {
  calendarId: string;
  /** Live gigs (from 30 days ago onward) now mirrored on the calendar. */
  gigs: number;
  /** Live practice series now mirrored on the calendar. */
  practiceSeries: number;
  lastSyncedAt: string | null;
}

/** Response of GET /bands/:bandId/integrations/google/calendar/sync. */
export interface CalendarSyncStatus {
  /** Last completed pull from Google; null before the first one. */
  lastSyncedAt: string | null;
  /** App changes waiting to be pushed to Google. */
  pending: number;
}
