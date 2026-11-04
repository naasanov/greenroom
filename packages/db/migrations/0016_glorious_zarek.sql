CREATE TABLE "drive_file_song_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"band_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"drive_file_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"is_folder" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drive_file_song_links" ADD CONSTRAINT "drive_file_song_links_band_id_bands_id_fk" FOREIGN KEY ("band_id") REFERENCES "public"."bands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file_song_links" ADD CONSTRAINT "drive_file_song_links_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_file_song_links_band_song_file_idx" ON "drive_file_song_links" USING btree ("band_id","song_id","drive_file_id");--> statement-breakpoint
CREATE INDEX "drive_file_song_links_song_id_idx" ON "drive_file_song_links" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "drive_file_song_links_band_file_idx" ON "drive_file_song_links" USING btree ("band_id","drive_file_id");