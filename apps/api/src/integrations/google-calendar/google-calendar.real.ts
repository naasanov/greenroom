import { notImplemented } from "../not-implemented.js";
import type {
  CalendarChangesResult,
  CalendarDeleteResult,
  CalendarEvent,
  CalendarEventResult,
  GoogleCalendarAdapter,
} from "./google-calendar.adapter.js";

const ni = <T>(): Promise<T> => notImplemented("GoogleCalendar", "5.1");

export class RealGoogleCalendarAdapter implements GoogleCalendarAdapter {
  createCalendar(): Promise<{ calendarId: string }> {
    return ni();
  }
  createEvent(): Promise<CalendarEvent> {
    return ni();
  }
  updateEvent(): Promise<CalendarEventResult> {
    return ni();
  }
  deleteEvent(): Promise<CalendarDeleteResult> {
    return ni();
  }
  patchInstance(): Promise<CalendarEventResult> {
    return ni();
  }
  listChanges(): Promise<CalendarChangesResult> {
    return ni();
  }
}
