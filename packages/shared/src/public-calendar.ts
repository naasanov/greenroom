import { z } from "zod";

export const publicCalendarLinkSchema = z.object({
  url: z.string(),
  token: z.string(),
});
export type PublicCalendarLink = z.infer<typeof publicCalendarLinkSchema>;

/** The only gig fields an anonymous visitor ever receives. */
export const publicCalendarGigSchema = z.object({
  title: z.string(),
  date: z.string(),
  startTime: z.string().nullable(),
  venueName: z.string().nullable(),
});
export type PublicCalendarGig = z.infer<typeof publicCalendarGigSchema>;

export const publicCalendarSchema = z.object({
  bandName: z.string(),
  photoUrl: z.string().nullable(),
  bio: z.string().nullable(),
  socialLinks: z.record(z.string(), z.string()),
  bookingEmail: z.string().nullable(),
  gigs: z.array(publicCalendarGigSchema),
});
export type PublicCalendar = z.infer<typeof publicCalendarSchema>;

/** Social links the public page shows, in display order. */
export const PUBLIC_SOCIAL_KEYS = [
  "instagram",
  "tiktok",
  "youtube",
  "spotify",
  "website",
] as const;
