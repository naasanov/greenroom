import { z } from "zod";
import { PRESET_INSTRUMENT_KEYS } from "./instruments.js";

export const bandRoleSchema = z.enum(["admin", "member"]);
export type BandRole = z.infer<typeof bandRoleSchema>;

export const createBandSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateBand = z.infer<typeof createBandSchema>;

export const updateBandSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  photoUrl: z.string().url().max(2048).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  socialLinks: z
    .record(z.string().min(1).max(40), z.string().max(2048))
    .optional(),
  bookingContact: z.string().trim().max(254).nullable().optional(),
});
export type UpdateBand = z.infer<typeof updateBandSchema>;

export const bandSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  photoUrl: z.string().nullable(),
  role: bandRoleSchema,
});
export type BandSummary = z.infer<typeof bandSummarySchema>;

export const bandDetailSchema = bandSummarySchema.extend({
  bio: z.string().nullable(),
  socialLinks: z.record(z.string(), z.string()),
  bookingContact: z.string().nullable(),
  createdAt: z.string(),
});
export type BandDetail = z.infer<typeof bandDetailSchema>;

export const instrumentSchema = z.object({
  presetKey: z.string().nullable(),
  customName: z.string().nullable(),
});
export type Instrument = z.infer<typeof instrumentSchema>;

export const setInstrumentsSchema = z.object({
  presets: z.array(z.enum(PRESET_INSTRUMENT_KEYS)).max(20),
  custom: z.array(z.string().trim().min(1).max(50)).max(20),
});
export type SetInstruments = z.infer<typeof setInstrumentsSchema>;

export const myInstrumentsSchema = z.object({
  presets: z.array(z.string()),
  custom: z.array(z.string()),
});
export type MyInstruments = z.infer<typeof myInstrumentsSchema>;

export const bandMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  instruments: myInstrumentsSchema,
  role: bandRoleSchema,
  joinedAt: z.string(),
});
export type BandMember = z.infer<typeof bandMemberSchema>;

export const updateMemberRoleSchema = z.object({ role: bandRoleSchema });
export type UpdateMemberRole = z.infer<typeof updateMemberRoleSchema>;

export const leaveBandSchema = z.object({
  deleteBand: z.boolean().optional(),
});
export type LeaveBand = z.infer<typeof leaveBandSchema>;

export const inviteLinkSchema = z.object({
  token: z.string(),
  url: z.string(),
  createdAt: z.string(),
});
export type InviteLinkInfo = z.infer<typeof inviteLinkSchema>;

export const invitePreviewSchema = z.object({
  band: z.object({ name: z.string(), photoUrl: z.string().nullable() }),
  memberCount: z.number().int(),
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

/** Error codes returned in the `code` field of 409 responses. */
export const BAND_ERROR_CODES = {
  lastAdmin: "LAST_ADMIN",
  onlyMemberMustDelete: "ONLY_MEMBER_MUST_DELETE",
} as const;
