import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { eq, isNull, and } from "drizzle-orm";
import {
  bands,
  gigLineup,
  gigSetlists,
  gigs,
  memberships,
  practiceSeries,
  setlistItems,
  setlists,
  songs,
  userInstruments,
  users,
  type Database,
} from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";

const DAY_MS = 86_400_000;
const MEMBERS = [
  ["Ben Bass", "bass"],
  ["Cleo Keys", "keys"],
  ["Dev Drums", "drums"],
] as const;
const SONGS = [
  ["Skyline Drive", "The Meridians", 214],
  ["Paper Planes", "Orchard Kids", 201],
  ["Low Tide", "Salt & Sparrow", 247],
  ["Midnight Train", "Gus & the Rails", 228],
  ["Red Line", "Transit Authority", 190],
  ["Harbor Lights", "The Dockhands", 236],
  ["Neon Rain", "Static Bloom", 205],
  ["Slow Burn", "Kettle & Fire", 262],
  ["Golden Hour", "Paper Lanterns", 219],
  ["Last Call", "The Dockhands", 183],
] as const;
// [title, venue, address, day offset, start hour (UTC)]
const GIGS = [
  ["Club Meridian", "Club Meridian", "88 Main St", 6, 20],
  ["Brewery Night", "Hopworks Brewery", "410 Hop Ave", 13, 19],
  ["Rooftop Sessions", "Skyline Rooftop", "5 High St", 21, 21],
  ["Harvest Festival", "Riverside Park", "1 River Rd", 35, 18],
  ["The Rusty Anchor", "The Rusty Anchor", "12 Dock St", -9, 21],
  ["Summer Fest", "Riverside Park", "1 River Rd", -40, 18],
  ["Open Mic Takeover", "Basement Bar", "7 Under St", -70, 20],
] as const;

@Injectable()
export class DemoBandService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Builds a demo band for the user unless they already have an active membership. */
  async ensureDemoBand(userId: string): Promise<boolean> {
    const [existing] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), isNull(memberships.leftAt)))
      .limit(1);
    if (existing) return false;
    await this.db.transaction(async (tx) => {
      await this.build(tx as unknown as Database, userId);
    });
    return true;
  }

  private async build(db: Database, userId: string): Promise<void> {
    const tag = randomBytes(4).toString("hex");
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const at = (offset: number, hour = 0) =>
      new Date(today.getTime() + offset * DAY_MS + hour * 3_600_000);

    const [band] = await db
      .insert(bands)
      .values({
        name: "Demo Band",
        slug: `demo-band-${tag}`,
        bio: "Sample data for reviewing Greenroom.",
      })
      .returning();
    const bandId = band!.id;

    const fakeUsers = await db
      .insert(users)
      .values(
        MEMBERS.map(([displayName]) => ({
          email: `demo-${tag}-${displayName.split(" ")[0]!.toLowerCase()}@example.test`,
          displayName,
        })),
      )
      .returning();
    const rows = await db
      .insert(memberships)
      .values([
        { bandId, userId, role: "admin" as const },
        ...fakeUsers.map((u) => ({ bandId, userId: u.id })),
      ])
      .returning();
    await db.insert(userInstruments).values(
      fakeUsers.map((u, position) => ({
        userId: u.id,
        presetKey: MEMBERS[position]![1],
        position: 0,
      })),
    );

    const songRows = await db
      .insert(songs)
      .values(
        SONGS.map(([title, artist, durationSeconds]) => ({
          bandId,
          title,
          artist,
          durationSeconds,
        })),
      )
      .returning();

    const gigRows = await db
      .insert(gigs)
      .values(
        GIGS.map(([title, venueName, address, offset, hour]) => ({
          bandId,
          title,
          venueName,
          address,
          date: at(offset).toISOString().slice(0, 10),
          timeZone: "UTC",
          startsAt: at(offset, hour),
          endsAt: at(offset, hour + 2),
          createdByUserId: userId,
        })),
      )
      .returning();

    // Lineups: everyone on even gigs, the admin plus two members on odd gigs.
    await db
      .insert(gigLineup)
      .values(
        gigRows.flatMap((g, i) =>
          rows
            .filter((_, m) => i % 2 === 0 || m < 3)
            .map((m) => ({ bandId, gigId: g.id, membershipId: m.id })),
        ),
      );

    // Song indexes per gig: the next gig plus the three past gigs, overlapping.
    const gigSongs: [number, number[]][] = [
      [0, [0, 1, 2, 3, 4, 5, 6, 7]],
      [4, [0, 2, 3, 4, 6, 8]],
      [5, [1, 2, 4, 5, 7, 9, 3]],
      [6, [0, 1, 5, 6, 8, 9]],
    ];
    for (const [gigIndex, songIdx] of gigSongs) {
      const [setlist] = await db
        .insert(setlists)
        .values({ bandId })
        .returning();
      await db.insert(setlistItems).values(
        songIdx.map((si, position) => ({
          setlistId: setlist!.id,
          songId: songRows[si]!.id,
          position,
        })),
      );
      await db.insert(gigSetlists).values({
        bandId,
        gigId: gigRows[gigIndex]!.id,
        setlistId: setlist!.id,
      });
    }

    // Weekly practice on the Tuesday one to two weeks back, 19:00 UTC.
    const back = at(-10);
    const dtstart = new Date(
      back.getTime() +
        ((2 - back.getUTCDay() + 7) % 7) * DAY_MS +
        19 * 3_600_000,
    );
    await db.insert(practiceSeries).values({
      bandId,
      title: "Weekly practice",
      location: "Rehearsal room B",
      rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU",
      dtstart,
      timeZone: "UTC",
      durationMinutes: 120,
      createdByUserId: userId,
    });
  }
}
