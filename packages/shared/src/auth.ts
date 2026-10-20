import { z } from "zod";

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
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

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  avatarUrl: z.string().url().max(2048).nullable().optional(),
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;

export const meResponseSchema = userSchema;
export type MeResponse = z.infer<typeof meResponseSchema>;
