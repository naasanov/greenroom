CREATE TABLE "song_chord_sheets" (
	"song_id" uuid PRIMARY KEY NOT NULL,
	"sheet" jsonb NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"key" text,
	"capo" integer,
	"tuning" text,
	"band_transpose" integer DEFAULT 0 NOT NULL,
	"edited_at" timestamp with time zone,
	"imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ug_search_cache" (
	"query_key" text PRIMARY KEY NOT NULL,
	"results" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song_chord_sheets" ADD CONSTRAINT "song_chord_sheets_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;