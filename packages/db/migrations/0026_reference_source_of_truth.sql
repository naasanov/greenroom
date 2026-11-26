-- Backfills "Spotify" and "YouTube" reference rows from the legacy song columns.
-- A song that already has a row with that label (case-insensitive) is left alone.
INSERT INTO "song_links" ("song_id", "label", "value", "position")
SELECT
	s."id",
	'Spotify',
	'https://open.spotify.com/track/' || btrim(s."spotify_track_id"),
	COALESCE((SELECT max(l."position") + 1 FROM "song_links" l WHERE l."song_id" = s."id"), 0)
FROM "songs" s
WHERE btrim(coalesce(s."spotify_track_id", '')) <> ''
	AND NOT EXISTS (
		SELECT 1 FROM "song_links" l
		WHERE l."song_id" = s."id" AND lower(btrim(l."label")) = 'spotify'
	);
--> statement-breakpoint
INSERT INTO "song_links" ("song_id", "label", "value", "position")
SELECT
	s."id",
	'YouTube',
	s."youtube_url",
	COALESCE((SELECT max(l."position") + 1 FROM "song_links" l WHERE l."song_id" = s."id"), 0)
FROM "songs" s
WHERE btrim(coalesce(s."youtube_url", '')) <> ''
	AND NOT EXISTS (
		SELECT 1 FROM "song_links" l
		WHERE l."song_id" = s."id" AND lower(btrim(l."label")) = 'youtube'
	);
