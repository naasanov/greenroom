import type { Database } from "../client.js";
import {
  bands,
  gigLineup,
  gigSetlists,
  gigs,
  mediaFolders,
  memberships,
  practiceOccurrenceOverrides,
  practiceRsvps,
  practiceSeries,
  practiceSetlistAssignments,
  setlistItems,
  setlists,
  songLinks,
  songs,
  userInstruments,
  users,
} from "../schema/index.js";
import {
  BANDS,
  GIG_IDS,
  MEDIA_FOLDERS,
  MEMBERSHIPS,
  PRACTICE_SERIES,
  SETLISTS,
  SONGS,
  USERS,
} from "./fixtures.js";

const DAY_MS = 86_400_000;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
// Local evening time for a gig: 20:00 UTC on the given date.
const eveningOf = (d: Date, hour = 20) =>
  new Date(startOfUtcDay(d).getTime() + hour * 3_600_000);

export interface BandSeedResult {
  scenario: "band";
  users: typeof USERS;
  bands: typeof BANDS;
  memberships: typeof MEMBERSHIPS;
  songs: typeof SONGS;
  setlists: typeof SETLISTS;
  mediaFolders: typeof MEDIA_FOLDERS;
  /** Gig dates are relative to `now`, so they are returned rather than hard-coded. */
  gigs: Record<
    keyof typeof GIG_IDS,
    { id: string; title: string; date: string }
  >;
  practice: {
    seriesId: string;
    title: string;
    firstStart: string;
    /** ISO start of an upcoming occurrence that was moved one day later. */
    moved: { originalStart: string; startsAt: string };
    /** ISO start of an upcoming occurrence that was cancelled. */
    cancelled: { originalStart: string };
  };
}

export async function seedBand(
  db: Database,
  now: Date,
): Promise<BandSeedResult> {
  const today = startOfUtcDay(now);

  await db.insert(users).values(Object.values(USERS));
  await db
    .insert(bands)
    .values([
      { ...BANDS.nightOwls, bio: "Four friends, one rehearsal room." },
      { ...BANDS.sideProject },
    ]);
  await db.insert(memberships).values([
    {
      id: MEMBERSHIPS.ava,
      bandId: BANDS.nightOwls.id,
      userId: USERS.ava.id,
      role: "admin",
    },
    { id: MEMBERSHIPS.ben, bandId: BANDS.nightOwls.id, userId: USERS.ben.id },
    { id: MEMBERSHIPS.cleo, bandId: BANDS.nightOwls.id, userId: USERS.cleo.id },
    { id: MEMBERSHIPS.dev, bandId: BANDS.nightOwls.id, userId: USERS.dev.id },
    {
      id: MEMBERSHIPS.benSideProject,
      bandId: BANDS.sideProject.id,
      userId: USERS.ben.id,
      role: "admin",
    },
  ]);
  await db.insert(userInstruments).values([
    { userId: USERS.ava.id, presetKey: "guitar", position: 0 },
    { userId: USERS.ava.id, presetKey: "vocals", position: 1 },
    { userId: USERS.ben.id, presetKey: "bass", position: 0 },
    { userId: USERS.cleo.id, presetKey: "keys", position: 0 },
    { userId: USERS.cleo.id, customName: "Theremin", position: 1 },
    { userId: USERS.dev.id, presetKey: "drums", position: 0 },
  ]);

  // Songs: three Spotify-backed, three YouTube-backed, two manual, one in the other band.
  const bandId = BANDS.nightOwls.id;
  await db.insert(songs).values([
    ...(
      [
        ["skyline", "Skyline Drive", "The Meridians", 214],
        ["paperPlanes", "Paper Planes", "Orchard Kids", 201],
        ["lowTide", "Low Tide", "Salt & Sparrow", 247],
      ] as const
    ).map(([key, title, artist, durationSeconds]) => ({
      id: SONGS[key].id,
      bandId,
      title,
      artist,
      durationSeconds,
      spotifyTrackId: `spotify-track-${key}`,
      imageUrl: `https://images.example.com/${key}.jpg`,
    })),
    ...(
      [
        ["midnightTrain", "Midnight Train", "Gus & the Rails"],
        ["redLine", "Red Line", "Transit Authority"],
        ["harborLights", "Harbor Lights", "The Dockhands"],
      ] as const
    ).map(([key, title, artist]) => ({
      id: SONGS[key].id,
      bandId,
      title,
      artist,
      youtubeUrl: `https://www.youtube.com/watch?v=${key}`,
    })),
    {
      id: SONGS.originalOne.id,
      bandId,
      title: "Original One",
      notes: "Count in 4 bars. Key change at the bridge.",
    },
    { id: SONGS.jamInA.id, bandId, title: "Jam in A", durationSeconds: 300 },
    {
      id: SONGS.sideProjectSong.id,
      bandId: BANDS.sideProject.id,
      title: "Side Song",
    },
  ]);
  await db.insert(songLinks).values([
    {
      songId: SONGS.skyline.id,
      label: "Guitar tab",
      value: "https://tabs.example.com/skyline",
      position: 0,
    },
    {
      songId: SONGS.skyline.id,
      label: "Lyrics",
      value: "https://lyrics.example.com/skyline",
      position: 1,
    },
    {
      songId: SONGS.midnightTrain.id,
      label: "Bass chart",
      value: "https://charts.example.com/midnight-train",
      position: 0,
    },
    {
      songId: SONGS.originalOne.id,
      label: "Demo",
      value: "https://demos.example.com/original-one",
      position: 0,
    },
  ]);

  // Setlists: one for the upcoming club gig, one assigned to the weekly practice.
  await db.insert(setlists).values([
    { id: SETLISTS.gig, bandId },
    { id: SETLISTS.practice, bandId },
  ]);
  const gigOrder = [
    "skyline",
    "midnightTrain",
    "paperPlanes",
    "originalOne",
    "lowTide",
  ] as const;
  const practiceOrder = ["redLine", "harborLights", "jamInA"] as const;
  await db.insert(setlistItems).values([
    ...gigOrder.map((k, position) => ({
      setlistId: SETLISTS.gig,
      songId: SONGS[k].id,
      position,
    })),
    ...practiceOrder.map((k, position) => ({
      setlistId: SETLISTS.practice,
      songId: SONGS[k].id,
      position,
    })),
  ]);

  // Gigs: past, upcoming, tentative (date, no time), hidden from the public calendar.
  interface GigDef {
    key: keyof typeof GIG_IDS;
    title: string;
    offset: number;
    hour?: number;
    band?: "sideProject";
    venueName?: string;
    address?: string;
    contactName?: string;
    contactEmail?: string;
    showOnPublicCalendar?: boolean;
  }
  const gigDefs: GigDef[] = [
    {
      key: "pastBar",
      title: "The Rusty Anchor",
      offset: -30,
      hour: 21,
      venueName: "The Rusty Anchor",
      address: "12 Dock St",
    },
    {
      key: "pastFestival",
      title: "Summer Fest",
      offset: -75,
      hour: 18,
      venueName: "Riverside Park",
      address: "1 River Rd",
    },
    {
      key: "upcomingClub",
      title: "Club Meridian",
      offset: 12,
      hour: 20,
      venueName: "Club Meridian",
      address: "88 Main St",
      contactName: "Pat Promoter",
      contactEmail: "pat@example.com",
    },
    {
      key: "tentative",
      title: "Maybe Brewery Night",
      offset: 40,
      venueName: "Hopworks Brewery",
    },
    {
      key: "hidden",
      title: "Private Party",
      offset: 20,
      hour: 19,
      venueName: "Somebody's Loft",
      showOnPublicCalendar: false,
    },
    {
      key: "sideProject",
      title: "Side Project Debut",
      offset: 15,
      hour: 20,
      venueName: "Basement Bar",
      band: "sideProject",
    },
  ];
  const gigResult = {} as BandSeedResult["gigs"];
  const gigRows = gigDefs.map(({ key, offset, hour, band, ...rest }) => {
    const date = addDays(today, offset);
    gigResult[key] = {
      id: GIG_IDS[key],
      title: rest.title,
      date: isoDate(date),
    };
    return {
      ...rest,
      id: GIG_IDS[key],
      bandId: band ? BANDS.sideProject.id : bandId,
      date: isoDate(date),
      timeZone: "UTC",
      startsAt: hour === undefined ? null : eveningOf(date, hour),
      endsAt: hour === undefined ? null : eveningOf(date, hour + 2),
      createdByUserId: USERS.ava.id,
    };
  });
  await db.insert(gigs).values(gigRows);
  await db.insert(gigLineup).values(
    (["ava", "ben", "dev"] as const).map((k) => ({
      bandId,
      gigId: GIG_IDS.upcomingClub,
      membershipId: MEMBERSHIPS[k],
    })),
  );
  await db
    .insert(gigSetlists)
    .values({ bandId, gigId: GIG_IDS.upcomingClub, setlistId: SETLISTS.gig });
  await db.insert(mediaFolders).values([
    {
      id: MEDIA_FOLDERS.soundcheck,
      bandId,
      gigId: GIG_IDS.pastBar,
      name: "Soundcheck",
      position: 0,
    },
    {
      id: MEDIA_FOLDERS.photos,
      bandId,
      gigId: GIG_IDS.pastBar,
      name: "Photos",
      position: 1,
    },
  ]);

  // Weekly Tuesday 19:00 UTC practice. dtstart is the Tuesday 22 to 28 days back, so
  // occurrences k=5 and k=6 always land one to two weeks ahead.
  const back = addDays(today, -22);
  const dtstart = eveningOf(addDays(back, (2 - back.getUTCDay() + 7) % 7), 19);
  const occ = (k: number) => addDays(dtstart, 7 * k);
  await db.insert(practiceSeries).values({
    id: PRACTICE_SERIES.weekly,
    bandId,
    title: "Weekly practice",
    location: "Rehearsal room B",
    rrule: "FREQ=WEEKLY;BYDAY=TU",
    dtstart,
    timeZone: "UTC",
    durationMinutes: 120,
    createdByUserId: USERS.ava.id,
  });
  const moved = { originalStart: occ(5), startsAt: addDays(occ(5), 1) };
  const cancelled = { originalStart: occ(6) };
  await db.insert(practiceOccurrenceOverrides).values([
    {
      bandId,
      seriesId: PRACTICE_SERIES.weekly,
      originalStart: moved.originalStart,
      startsAt: moved.startsAt,
      endsAt: new Date(moved.startsAt.getTime() + 2 * 3_600_000),
    },
    {
      bandId,
      seriesId: PRACTICE_SERIES.weekly,
      originalStart: cancelled.originalStart,
      cancelled: true,
    },
  ]);
  const rsvp = (
    k: number,
    user: keyof typeof USERS,
    status: "going" | "maybe" | "not_going",
  ) => ({
    bandId,
    seriesId: PRACTICE_SERIES.weekly,
    originalStart: occ(k),
    userId: USERS[user].id,
    status,
  });
  await db
    .insert(practiceRsvps)
    .values([
      rsvp(2, "ava", "going"),
      rsvp(2, "ben", "going"),
      rsvp(2, "cleo", "not_going"),
      rsvp(4, "ava", "going"),
      rsvp(4, "dev", "maybe"),
      rsvp(5, "ben", "going"),
    ]);
  await db.insert(practiceSetlistAssignments).values({
    bandId,
    seriesId: PRACTICE_SERIES.weekly,
    effectiveFrom: dtstart,
    scope: "forward",
    setlistId: SETLISTS.practice,
  });

  return {
    scenario: "band",
    users: USERS,
    bands: BANDS,
    memberships: MEMBERSHIPS,
    songs: SONGS,
    setlists: SETLISTS,
    mediaFolders: MEDIA_FOLDERS,
    gigs: gigResult,
    practice: {
      seriesId: PRACTICE_SERIES.weekly,
      title: "Weekly practice",
      firstStart: dtstart.toISOString(),
      moved: {
        originalStart: moved.originalStart.toISOString(),
        startsAt: moved.startsAt.toISOString(),
      },
      cancelled: { originalStart: cancelled.originalStart.toISOString() },
    },
  };
}
