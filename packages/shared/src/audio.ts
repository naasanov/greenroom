import { z } from "zod";

export const AUDIO_MARKER_TITLE_MAX = 80;
export const AUDIO_MARKER_MAX_POSITION_MS = 24 * 60 * 60 * 1000;

export const createAudioMarkerSchema = z.object({
  positionMs: z.number().int().min(0).max(AUDIO_MARKER_MAX_POSITION_MS),
  title: z.string().trim().min(1).max(AUDIO_MARKER_TITLE_MAX),
});

export const updateAudioMarkerSchema = createAudioMarkerSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field is required",
  });

export type CreateAudioMarker = z.infer<typeof createAudioMarkerSchema>;
export type UpdateAudioMarker = z.infer<typeof updateAudioMarkerSchema>;

/** A band-shared marker on a Drive audio file. */
export interface AudioMarker {
  id: string;
  fileId: string;
  positionMs: number;
  title: string;
  createdBy: { userId: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}
