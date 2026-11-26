import { readFileSync } from "node:fs";
import { bands, songLinks, songs } from "@greenroom/db";
import { asc, eq, sql } from "drizzle-orm";
import { expect, test } from "../src/fixtures.js";

test.skip(({ isMobile }) => isMobile, "DB-level spec, desktop only");

const MIGRATION = readFileSync(
  new URL(
    "../../../packages/db/migrations/0026_reference_source_of_truth.sql",
    import.meta.url,
  ),
  "utf8",
);

test("the backfill adds missing Spotify and YouTube references, once, and never overwrites", async ({
  db,
}) => {
  const [band] = await db
    .insert(bands)
    .values({ name: "Backfill", slug: "backfill" })
    .returning();
  const bandId = band!.id;
  const yt = "https://www.youtube.com/watch?v=abcdefghijk";
  const [both, existing, plain, blank] = await db
    .insert(songs)
    .values([
      { bandId, title: "Both", spotifyTrackId: "trk1", youtubeUrl: yt },
      { bandId, title: "Has refs", spotifyTrackId: "trk2", youtubeUrl: yt },
      { bandId, title: "No columns" },
      { bandId, title: "Blank", spotifyTrackId: "  ", youtubeUrl: "" },
    ])
    .returning();
  await db.insert(songLinks).values([
    {
      songId: both!.id,
      label: "Lyrics",
      value: "https://l.example.com",
      position: 0,
    },
    {
      songId: both!.id,
      label: "Tab",
      value: "https://t.example.com",
      position: 4,
    },
    // Labels compare case-insensitively and ignore surrounding spaces.
    {
      songId: existing!.id,
      label: " SPOTIFY ",
      value: "https://open.spotify.com/track/handPicked",
      position: 0,
    },
    {
      songId: existing!.id,
      label: "youtube",
      value: "https://youtu.be/handPicked1",
      position: 1,
    },
  ]);

  const run = async () => {
    for (const statement of MIGRATION.split("--> statement-breakpoint")) {
      await db.execute(sql.raw(statement));
    }
  };
  const rows = async (songId: string) =>
    (
      await db
        .select({
          label: songLinks.label,
          value: songLinks.value,
          position: songLinks.position,
        })
        .from(songLinks)
        .where(eq(songLinks.songId, songId))
        .orderBy(asc(songLinks.position))
    ).map((r) => ({ ...r }));

  await run();
  const afterFirst = {
    both: await rows(both!.id),
    existing: await rows(existing!.id),
    plain: await rows(plain!.id),
    blank: await rows(blank!.id),
  };
  expect(afterFirst.both).toEqual([
    { label: "Lyrics", value: "https://l.example.com", position: 0 },
    { label: "Tab", value: "https://t.example.com", position: 4 },
    {
      label: "Spotify",
      value: "https://open.spotify.com/track/trk1",
      position: 5,
    },
    { label: "YouTube", value: yt, position: 6 },
  ]);
  // Existing references are untouched, whatever the columns say.
  expect(afterFirst.existing).toEqual([
    {
      label: " SPOTIFY ",
      value: "https://open.spotify.com/track/handPicked",
      position: 0,
    },
    { label: "youtube", value: "https://youtu.be/handPicked1", position: 1 },
  ]);
  expect(afterFirst.plain).toEqual([]);
  expect(afterFirst.blank).toEqual([]);

  // A second run inserts nothing, and the columns stay in place.
  await run();
  expect({
    both: await rows(both!.id),
    existing: await rows(existing!.id),
    plain: await rows(plain!.id),
    blank: await rows(blank!.id),
  }).toEqual(afterFirst);
  const [col] = await db.select().from(songs).where(eq(songs.id, both!.id));
  expect(col).toMatchObject({ spotifyTrackId: "trk1", youtubeUrl: yt });
});
