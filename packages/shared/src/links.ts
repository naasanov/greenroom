import { z } from "zod";

export const gigLinkSchema = z.object({
  bandId: z.string().uuid(),
  gigId: z.string().uuid(),
});
export type GigLink = z.infer<typeof gigLinkSchema>;

export const songLinkSchema = z.object({
  bandId: z.string().uuid(),
  songId: z.string().uuid(),
});
export type SongLink = z.infer<typeof songLinkSchema>;

/** `occurrenceKey` is null when no live occurrence falls on the requested date. */
export const practiceLinkSchema = z.object({
  bandId: z.string().uuid(),
  seriesId: z.string().uuid(),
  occurrenceKey: z.string().nullable(),
});
export type PracticeLink = z.infer<typeof practiceLinkSchema>;
