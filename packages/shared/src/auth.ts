import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  calendarEmail: z.string().nullable(),
  calendarInvitesEnabled: z.boolean(),
  lastBandId: z.string().uuid().nullable(),
});
export type User = z.infer<typeof userSchema>;

export const magicLinkRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  redirectTo: z.string().max(2048).optional(),
});
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;

export const magicLinkVerifySchema = z.object({
  token: z.string().min(1).max(256),
});
export type MagicLinkVerify = z.infer<typeof magicLinkVerifySchema>;

export const authResultSchema = z.object({
  user: userSchema,
  isNewUser: z.boolean(),
  redirectTo: z.string(),
});
export type AuthResult = z.infer<typeof authResultSchema>;

/** Optional address for calendar invites; blank clears it, stored lowercase. */
export const calendarEmailSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().toLowerCase().email().max(254).nullable(),
);

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
  calendarEmail: calendarEmailSchema.optional(),
  calendarInvitesEnabled: z.boolean().optional(),
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const meResponseSchema = userSchema;
export type MeResponse = z.infer<typeof meResponseSchema>;

export const setCurrentBandSchema = z.object({ bandId: z.string().uuid() });
export type SetCurrentBand = z.infer<typeof setCurrentBandSchema>;

export const deleteAccountSchema = z.object({ confirm: z.literal("DELETE") });
export type DeleteAccount = z.infer<typeof deleteAccountSchema>;

const accountBandSchema = z.object({ id: z.string().uuid(), name: z.string() });
export type AccountBand = z.infer<typeof accountBandSchema>;

/** What deleting the account would do to each of the user's bands. */
export const deletionPreviewSchema = z.object({
  deleteBands: z.array(accountBandSchema),
  leaveBands: z.array(accountBandSchema),
  blockedBands: z.array(accountBandSchema),
});
export type DeletionPreview = z.infer<typeof deletionPreviewSchema>;

/** Error codes returned in the `code` field of account 409 responses. */
export const ACCOUNT_ERROR_CODES = {
  lastAdmin: "ACCOUNT_LAST_ADMIN",
} as const;

/** A member's private subscription feed (https URL and its webcal twin). */
export const calendarFeedLinkSchema = z.object({
  url: z.string(),
  webcalUrl: z.string(),
});
export type CalendarFeedLink = z.infer<typeof calendarFeedLinkSchema>;
