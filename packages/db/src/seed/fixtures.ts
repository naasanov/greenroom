import { fixedId } from "./ids.js";

/** Users in the `band` scenario. Emails are fixed so tests can request magic links for them. */
export const USERS = {
  ava: {
    id: fixedId("user", 1),
    email: "ava@example.com",
    displayName: "Ava Admin",
  },
  ben: {
    id: fixedId("user", 2),
    email: "ben@example.com",
    displayName: "Ben Bass",
  },
  cleo: {
    id: fixedId("user", 3),
    email: "cleo@example.com",
    displayName: "Cleo Keys",
  },
  dev: {
    id: fixedId("user", 4),
    email: "dev@example.com",
    displayName: "Dev Drums",
  },
} as const;

/** Ben belongs to both bands; Ava, Cleo and Dev only to the first. */
export const BANDS = {
  nightOwls: {
    id: fixedId("band", 1),
    name: "The Night Owls",
    slug: "night-owls",
    publicCalendarToken: "night-owls-public-calendar-token",
  },
  sideProject: {
    id: fixedId("band", 2),
    name: "Side Project",
    slug: "side-project",
    publicCalendarToken: "side-project-public-calendar-token",
  },
} as const;

export const MEMBERSHIPS = {
  ava: fixedId("membership", 1),
  ben: fixedId("membership", 2),
  cleo: fixedId("membership", 3),
  dev: fixedId("membership", 4),
  benSideProject: fixedId("membership", 5),
} as const;

export const SONGS = {
  skyline: {
    id: fixedId("song", 1),
    title: "Skyline Drive",
    source: "spotify",
  },
  paperPlanes: {
    id: fixedId("song", 2),
    title: "Paper Planes",
    source: "spotify",
  },
  lowTide: { id: fixedId("song", 3), title: "Low Tide", source: "spotify" },
  midnightTrain: {
    id: fixedId("song", 4),
    title: "Midnight Train",
    source: "youtube",
  },
  redLine: { id: fixedId("song", 5), title: "Red Line", source: "youtube" },
  harborLights: {
    id: fixedId("song", 6),
    title: "Harbor Lights",
    source: "youtube",
  },
  originalOne: {
    id: fixedId("song", 7),
    title: "Original One",
    source: "manual",
  },
  jamInA: { id: fixedId("song", 8), title: "Jam in A", source: "manual" },
  sideProjectSong: {
    id: fixedId("song", 9),
    title: "Side Song",
    source: "manual",
  },
} as const;

export const SETLISTS = {
  gig: fixedId("setlist", 1),
  practice: fixedId("setlist", 2),
} as const;

export const PRACTICE_SERIES = {
  weekly: fixedId("practice", 1),
} as const;

export const GIG_IDS = {
  pastBar: fixedId("gig", 1),
  pastFestival: fixedId("gig", 2),
  upcomingClub: fixedId("gig", 3),
  tentative: fixedId("gig", 4),
  hidden: fixedId("gig", 5),
  sideProject: fixedId("gig", 6),
} as const;

export const MEDIA_FOLDERS = {
  soundcheck: fixedId("folder", 1),
  photos: fixedId("folder", 2),
} as const;
