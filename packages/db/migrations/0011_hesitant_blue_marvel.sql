ALTER TABLE "upload_sessions" ADD COLUMN "drive_parent_id" text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "song_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "name_customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "media_item_id" uuid;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "drive_file_id" text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_sessions_gig_status_idx" ON "upload_sessions" USING btree ("gig_id","status");