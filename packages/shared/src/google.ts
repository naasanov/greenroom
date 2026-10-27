import { z } from "zod";

export const googleServiceSchema = z.enum(["drive", "calendar"]);
export type GoogleService = z.infer<typeof googleServiceSchema>;

export const GOOGLE_SERVICE_SCOPES: Record<GoogleService, string> = {
  drive: "https://www.googleapis.com/auth/drive",
  calendar: "https://www.googleapis.com/auth/calendar",
};

export const googleLinkStatusSchema = z.object({
  linked: z.boolean(),
  email: z.string().nullable(),
  linkedBy: z
    .object({ userId: z.string().uuid(), displayName: z.string() })
    .nullable(),
  linkedAt: z.string().nullable(),
});
export type GoogleLinkStatus = z.infer<typeof googleLinkStatusSchema>;

export const googleIntegrationsSchema = z.object({
  drive: googleLinkStatusSchema.extend({ folderId: z.string().nullable() }),
  calendar: googleLinkStatusSchema.extend({
    calendarId: z.string().nullable(),
  }),
});
export type GoogleIntegrations = z.infer<typeof googleIntegrationsSchema>;

export const googlePickerConfigSchema = z.object({
  accessToken: z.string(),
  developerKey: z.string().nullable(),
  appId: z.string().nullable(),
  fake: z.boolean(),
});
export type GooglePickerConfig = z.infer<typeof googlePickerConfigSchema>;

export const GOOGLE_LINK_ERROR_REASONS = [
  "denied",
  "scope_denied",
  "invalid_state",
  "exchange_failed",
] as const;
export type GoogleLinkErrorReason = (typeof GOOGLE_LINK_ERROR_REASONS)[number];
