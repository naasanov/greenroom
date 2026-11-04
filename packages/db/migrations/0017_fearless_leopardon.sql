ALTER TABLE "upload_sessions" ALTER COLUMN "gig_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "target_drive_folder_id" text;--> statement-breakpoint
CREATE INDEX "upload_sessions_target_folder_idx" ON "upload_sessions" USING btree ("band_id","target_drive_folder_id","file_fingerprint");