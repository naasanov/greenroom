DROP TABLE IF EXISTS "calendar_sync_states" CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "gigs_gcal_event_id_idx";--> statement-breakpoint
ALTER TABLE "bands" DROP COLUMN IF EXISTS "calendar_id";--> statement-breakpoint
ALTER TABLE "gigs" DROP COLUMN IF EXISTS "gcal_event_id";--> statement-breakpoint
ALTER TABLE "gigs" DROP COLUMN IF EXISTS "gcal_etag";--> statement-breakpoint
ALTER TABLE "practice_occurrence_overrides" DROP COLUMN IF EXISTS "gcal_instance_etag";--> statement-breakpoint
ALTER TABLE "practice_series" DROP COLUMN IF EXISTS "gcal_event_id";--> statement-breakpoint
ALTER TABLE "practice_series" DROP COLUMN IF EXISTS "gcal_etag";
