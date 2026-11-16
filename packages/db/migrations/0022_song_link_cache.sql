CREATE TABLE "song_link_cache" (
	"source_url" text PRIMARY KEY NOT NULL,
	"links" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
