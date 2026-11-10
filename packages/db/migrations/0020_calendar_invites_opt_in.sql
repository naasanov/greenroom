ALTER TABLE "users" ALTER COLUMN "calendar_invites_enabled" SET DEFAULT false;--> statement-breakpoint
UPDATE "users" SET "calendar_invites_enabled" = false;
