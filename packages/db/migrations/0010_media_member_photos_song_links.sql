ALTER TABLE "memberships" ADD COLUMN "photo_drive_file_id" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "song_id" uuid;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "name_customized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_items_song_id_idx" ON "media_items" USING btree ("song_id");