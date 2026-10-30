import { z } from "zod";

export const FEEDBACK_ERROR_CODES = {
  notConfigured: "FEEDBACK_NOT_CONFIGURED",
  rateLimited: "FEEDBACK_RATE_LIMITED",
} as const;

export const FEEDBACK_MESSAGE_MAX = 4000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** Body of POST /feedback. A blank title is derived from the message. */
export const feedbackSchema = z.object({
  title: optionalText(120),
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX),
  pageUrl: optionalText(2000),
  userAgent: optionalText(500),
  bandId: z.string().uuid().optional(),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type FeedbackRequest = z.input<typeof feedbackSchema>;

/** Response of POST /feedback. */
export interface FeedbackResult {
  ok: true;
}
