DROP INDEX "media_items_drive_file_id_idx";--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "drive_gigs_folder_id" text;--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "drive_photos_folder_id" text;--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "photo_drive_file_id" text;--> statement-breakpoint
ALTER TABLE "bands" ADD COLUMN "photo_mime_type" text;--> statement-breakpoint
CREATE UNIQUE INDEX "media_folders_drive_folder_id_idx" ON "media_folders" USING btree ("drive_folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_band_drive_file_idx" ON "media_items" USING btree ("band_id","drive_file_id");