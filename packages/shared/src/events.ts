import { z } from "zod";

// ---- primitives ----

export const localDateSchema = z.iso.date();
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");
export const timeZoneSchema = z.string().min(1).max(64);
export const instantSchema = z.iso.datetime({ offset: true });

export const EVENT_TYPES = ["gig", "practice"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Longest span the range listing accepts. */
export const MAX_EVENT_RANGE_DAYS = 400;

export const EVENT_ERROR_CODES = {
  unsupportedRecurrence: "UNSUPPORTED_RECURRENCE",
  invalidOccurrence: "INVALID_OCCURRENCE",
} as const;

// ---- gigs ----

const gigFields = {
  title: z.string().trim().min(1).max(200),
  date: localDateSchema,
  allDay: z.boolean(),
  startTime: localTimeSchema.nullable(),
  endTime: localTimeSchema.nullable(),
  loadInTime: localTimeSchema.nullable(),
  timeZone: timeZoneSchema,
  venueName: z.string().trim().max(200).nullable(),
  address: z.string().trim().max(500).nullable(),
  googlePlaceId: z.string().trim().max(300).nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  contactName: z.string().trim().max(200).nullable(),
  contactPhone: z.string().trim().max(50).nullable(),
  contactEmail: z.string().trim().email().max(254).nullable(),
  notes: z.string().trim().max(10000).nullable(),
  showOnPublicCalendar: z.boolean(),
};

/** Only title and date are required; everything else is optional. */
export const createGigSchema = z.object({
  ...gigFields,
  allDay: gigFields.allDay.optional(),
  startTime: gigFields.startTime.optional(),
  endTime: gigFields.endTime.optional(),
  loadInTime: gigFields.loadInTime.optional(),
  timeZone: gigFields.timeZone.optional(),
  venueName: gigFields.venueName.optional(),
  address: gigFields.address.optional(),
  googlePlaceId: gigFields.googlePlaceId.optional(),
  lat: gigFields.lat.optional(),
  lng: gigFields.lng.optional(),
  contactName: gigFields.contactName.optional(),
  contactPhone: gigFields.contactPhone.optional(),
  contactEmail: gigFields.contactEmail.optional(),
  notes: gigFields.notes.optional(),
  showOnPublicCalendar: gigFields.showOnPublicCalendar.optional(),
});
export type CreateGig = z.infer<typeof createGigSchema>;

/** Omitted keys are left alone; null clears a nullable field. */
export const updateGigSchema = z.object(gigFields).partial();
export type UpdateGig = z.infer<typeof updateGigSchema>;

export interface Gig {
  id: string;
  bandId: string;
  title: string;
  /** Local calendar date in `timeZone`. */
  date: string;
  allDay: boolean;
  /** Local wall-clock times in `timeZone`, for form population. */
  startTime: string | null;
  endTime: string | null;
  loadInTime: string | null;
  startsAt: string | null;
  endsAt: string | null;
  loadInAt: string | null;
  timeZone: string;
  venueName: string | null;
  address: string | null;
  googlePlaceId: string | null;
  lat: number | null;
  lng: number | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
  showOnPublicCalendar: boolean;
  driveFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- recurrence ----

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const weekdaySchema = z.enum(WEEKDAYS);
export type Weekday = z.infer<typeof weekdaySchema>;

export const recurrenceEndSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("never") }),
  z.object({ type: z.literal("until"), date: localDateSchema }),
  z.object({
    type: z.literal("count"),
    count: z.number().int().min(1).max(520),
  }),
]);
export type RecurrenceEnd = z.infer<typeof recurrenceEndSchema>;

/**
 * freq "none" is a one-off (COUNT=1). weekly takes `byWeekday` (default: the start
 * weekday); monthly repeats on the start's day of month or its nth weekday.
 */
export const recurrenceSchema = z
  .object({
    freq: z.enum(["none", "weekly", "monthly"]),
    interval: z.number().int().min(1).max(52).default(1),
    byWeekday: z.array(weekdaySchema).min(1).max(7).optional(),
    monthlyMode: z.enum(["dayOfMonth", "nthWeekday"]).optional(),
    end: recurrenceEndSchema.default({ type: "never" }),
  })
  .superRefine((r, ctx) => {
    if (r.byWeekday && r.freq !== "weekly") {
      ctx.addIssue({
        code: "custom",
        path: ["byWeekday"],
        message: "byWeekday applies to weekly recurrence only",
      });
    }
    if (r.monthlyMode && r.freq !== "monthly") {
      ctx.addIssue({
        code: "custom",
        path: ["monthlyMode"],
        message: "monthlyMode applies to monthly recurrence only",
      });
    }
  });
export type Recurrence = z.infer<typeof recurrenceSchema>;

// ---- practices ----

export const createPracticeSchema = z.object({
  title: z.string().trim().min(1).max(200),
  location: z.string().trim().max(500).nullable().optional(),
  startDate: localDateSchema,
  startTime: localTimeSchema,
  durationMinutes: z.number().int().min(1).max(1440),
  timeZone: timeZoneSchema,
  recurrence: recurrenceSchema.default({
    freq: "none",
    interval: 1,
    end: { type: "never" },
  }),
});
export type CreatePractice = z.infer<typeof createPracticeSchema>;

export const EDIT_SCOPES = ["this", "this_and_following", "all"] as const;
export const editScopeSchema = z.enum(EDIT_SCOPES);
export type EditScope = z.infer<typeof editScopeSchema>;

/**
 * scope "this": title, location, startDate, startTime, durationMinutes.
 * "this_and_following": same minus startDate, plus timeZone and recurrence.
 * "all": every field.
 */
export const updatePracticeSchema = z
  .object({
    scope: editScopeSchema,
    title: z.string().trim().min(1).max(200).optional(),
    location: z.string().trim().max(500).nullable().optional(),
    startDate: localDateSchema.optional(),
    startTime: localTimeSchema.optional(),
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    timeZone: timeZoneSchema.optional(),
    recurrence: recurrenceSchema.optional(),
  })
  .superRefine((b, ctx) => {
    const banned: Array<keyof typeof b> =
      b.scope === "this"
        ? ["timeZone", "recurrence"]
        : b.scope === "this_and_following"
          ? ["startDate"]
          : [];
    for (const key of banned) {
      if (b[key] !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} cannot be set with scope ${b.scope}`,
        });
      }
    }
  });
export type UpdatePractice = z.infer<typeof updatePracticeSchema>;

export const deletePracticeQuerySchema = z.object({ scope: editScopeSchema });
export type DeletePracticeQuery = z.infer<typeof deletePracticeQuerySchema>;

export interface PracticeSeries {
  id: string;
  bandId: string;
  title: string;
  location: string | null;
  /** RRULE line without DTSTART, as sent to Google Calendar, e.g. `RRULE:FREQ=WEEKLY;BYDAY=TU`. */
  rrule: string;
  recurrence: Recurrence;
  /** Local date and time of the first occurrence in `timeZone`. */
  startDate: string;
  startTime: string;
  dtstart: string;
  timeZone: string;
  durationMinutes: number;
  createdAt: string;
}

// ---- RSVPs ----

export const RSVP_STATUSES = [
  "going",
  "maybe",
  "not_going",
  "no_response",
] as const;
export const rsvpStatusSchema = z.enum(RSVP_STATUSES);
export type RsvpStatus = z.infer<typeof rsvpStatusSchema>;

export const setRsvpSchema = z.object({ status: rsvpStatusSchema });
export type SetRsvp = z.infer<typeof setRsvpSchema>;

export interface Attendee {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: RsvpStatus;
}

// ---- setlist assignment ----

export const ASSIGNMENT_SCOPES = ["this", "this_and_following"] as const;

export const setPracticeSetlistSchema = z.object({
  setlistId: z.string().uuid(),
  scope: z.enum(ASSIGNMENT_SCOPES),
  /** For this_and_following: replace (default) or keep later occurrences' own setlists. */
  onConflict: z.enum(["replace", "keep"]).default("replace"),
});
export type SetPracticeSetlist = z.infer<typeof setPracticeSetlistSchema>;

export type SetlistSource = "single" | "forward" | null;

export interface CustomSetlistOccurrence {
  occurrenceKey: string;
  originalStart: string;
  setlistId: string;
}

export interface PracticeSetlistResult {
  setlistId: string | null;
  source: SetlistSource;
  /** Later occurrences that had their own single setlist before this change. */
  conflicts: CustomSetlistOccurrence[];
  /** True when those conflicts were overwritten. */
  conflictsReplaced: boolean;
}

// ---- events ----

export interface GigEvent {
  type: "gig";
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string;
  venueName: string | null;
}

export interface PracticeEvent {
  type: "practice";
  /** `${seriesId}_${occurrenceKey}` */
  id: string;
  seriesId: string;
  /** UTC instant the rule generated; stable even when the occurrence is moved. */
  originalStart: string;
  /** URL-safe `YYYYMMDDTHHMMSSZ` form of originalStart. */
  occurrenceKey: string;
  title: string;
  location: string | null;
  date: string;
  allDay: false;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  recurring: boolean;
  /** True when this occurrence has an override row (moved or edited). */
  modified: boolean;
}

export type CalendarEvent = GigEvent | PracticeEvent;

export const listEventsQuerySchema = z.object({
  from: instantSchema,
  to: instantSchema,
  type: z.enum(EVENT_TYPES).optional(),
});
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export interface PracticeOccurrence extends PracticeEvent {
  durationMinutes: number;
  attendees: Attendee[];
  myRsvp: RsvpStatus;
  setlistId: string | null;
  setlistSource: SetlistSource;
  /** Later occurrences with their own single setlist. */
  laterCustomSetlists: CustomSetlistOccurrence[];
}

export interface PracticeEditResult {
  /** The series the edit landed on (a new series for this_and_following). */
  series: PracticeSeries;
  /** First affected occurrence, or null if the requested one no longer exists. */
  occurrence: PracticeOccurrence | null;
}

// ---- places ----

export const placesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});
export type PlacesQuery = z.infer<typeof placesQuerySchema>;
