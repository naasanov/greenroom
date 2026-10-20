import type { Attendee } from "@/components/app/rsvp";
import type { BandSummary } from "@/components/app/band-switcher";
import type { LinkRow } from "@/components/app/link-list";

export const BANDS: BandSummary[] = [
  { id: "night-owls", name: "The Night Owls" },
  { id: "basement-tapes", name: "Basement Tapes" },
  {
    id: "long",
    name: "The Extraordinarily Long Named Ensemble of Friends",
  },
];

export interface Song {
  id: string;
  title: string;
  artist?: string;
  duration?: string;
  notes: string;
  links: LinkRow[];
}

export const SONGS: Song[] = [
  {
    id: "s1",
    title: "Midnight City",
    artist: "M83",
    duration: "4:03",
    notes: "Capo on 2. Synth intro, wait 4 bars before the band comes in.",
    links: [
      {
        id: "l1",
        label: "Spotify",
        value: "https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtt3CU",
      },
      {
        id: "l2",
        label: "Tab",
        value: "https://www.songsterr.com/a/wsa/m83-midnight-city-tab-s1",
      },
      { id: "l3", label: "Key", value: "F# minor, 105 bpm" },
    ],
  },
  {
    id: "s2",
    title: "Dreams",
    artist: "Fleetwood Mac",
    duration: "4:14",
    notes: "",
    links: [
      {
        id: "l4",
        label: "YouTube",
        value: "https://www.youtube.com/watch?v=mrZRURcb1cM",
      },
    ],
  },
  { id: "s3", title: "Untitled jam in D", notes: "", links: [] },
  {
    id: "s4",
    title: "The Ballad of a Very Long Song Title That Keeps Going and Going",
    artist: "An Artist With an Equally Lengthy Name and Several Collaborators",
    duration: "12:48",
    notes: "Long one. Check the bridge tempo.",
    links: [],
  },
  {
    id: "s5",
    title: "Superstition",
    artist: "Stevie Wonder",
    duration: "4:26",
    notes: "Clavinet part is on the keys.",
    links: [],
  },
];

export const ATTENDEES: Attendee[] = [
  {
    id: "a1",
    name: "Ava Chen",
    status: "none",
    instruments: ["vocals", "guitar"],
  },
  { id: "a2", name: "Marcus Reed", status: "declined", instruments: ["drums"] },
  { id: "a3", name: "Priya Natarajan", status: "going", instruments: ["bass"] },
  {
    id: "a4",
    name: "Jonas Eriksson",
    status: "maybe",
    instruments: ["keys", "synth"],
  },
  {
    id: "a5",
    name: "Sam O'Brien-Fitzgerald-Montgomery",
    status: "going",
    instruments: ["saxophone", "oud"],
  },
];

export interface AgendaEvent {
  id: string;
  type: "gig" | "practice";
  title: string;
  date: Date;
  time?: string;
  venue?: string;
  past?: boolean;
}

// Noon UTC so the date is stable in every time zone.
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

export const AGENDA: AgendaEvent[] = [
  {
    id: "e1",
    type: "practice",
    title: "Practice",
    date: d("2026-10-06"),
    time: "7:00 PM",
    past: true,
  },
  {
    id: "e2",
    type: "gig",
    title: "Fall Fest Main Stage",
    date: d("2026-10-11"),
    time: "8:30 PM",
    venue: "Riverside Park",
    past: true,
  },
  {
    id: "e3",
    type: "practice",
    title: "Practice",
    date: d("2026-10-20"),
    time: "7:00 PM",
  },
  {
    id: "e4",
    type: "gig",
    title: "Halloween Bash at The Echo",
    date: d("2026-10-31"),
    time: "9:00 PM",
    venue: "The Echo Lounge",
  },
  {
    id: "e5",
    type: "gig",
    title: "Tentative: Brewery taproom set with the whole crew",
    date: d("2026-11-14"),
    venue: "Wildflower Brewing Company and Taproom",
  },
];

export const MONTH_CHIPS = [
  { type: "practice", title: "Practice", time: "7p" },
  { type: "gig", title: "Halloween Bash", time: "9p" },
  { type: "gig", title: "Tentative brewery set with a very long name" },
] as const;

export const PLAYLIST_ART =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6b4f"/><stop offset="1" stop-color="#d9a441"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="32" r="14" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3"/></svg>`,
  );
