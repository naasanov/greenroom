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

export const FEEDBACK_CATEGORIES = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature Request" },
  { value: "ui", label: "UI" },
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number]["value"];

/** Body of POST /feedback. A blank title is derived from the message. */
export const feedbackSchema = z.object({
  title: optionalText(120),
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX),
  pageUrl: optionalText(2000),
  userAgent: optionalText(500),
  bandId: z.string().uuid().optional(),
  // Unknown categories are dropped so older or odd callers still succeed.
  category: z
    .enum(FEEDBACK_CATEGORIES.map((c) => c.value) as [FeedbackCategory])
    .optional()
    .catch(undefined),
  // Whitespace runs (including newlines) collapse so area stays a single line.
  area: z
    .string()
    .transform((v) => v.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(60))
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type FeedbackRequest = z.input<typeof feedbackSchema>;

/** Response of POST /feedback. */
export interface FeedbackResult {
  ok: true;
}
