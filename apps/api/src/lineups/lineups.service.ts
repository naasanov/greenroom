import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  gigLineup,
  gigs,
  memberships,
  users,
  type Database,
} from "@greenroom/db";
import {
  SETLIST_ERROR_CODES,
  type Lineup,
  type LineupCopyResult,
  type LineupMember,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Db = Database | Tx;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class LineupsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private async findGig(bandId: string, gigId: string, db: Db = this.db) {
    if (!UUID_RE.test(gigId)) throw new NotFoundException("Gig not found");
    const [gig] = await db
      .select({ id: gigs.id, date: gigs.date })
      .from(gigs)
      .where(
        and(
          eq(gigs.id, gigId),
          eq(gigs.bandId, bandId),
          isNull(gigs.deletedAt),
        ),
      );
    if (!gig) throw new NotFoundException("Gig not found");
    return gig;
  }

  private async members(db: Db, gigId: string): Promise<LineupMember[]> {
    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        leftAt: memberships.leftAt,
      })
      .from(gigLineup)
      .innerJoin(memberships, eq(memberships.id, gigLineup.membershipId))
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(gigLineup.gigId, gigId));
    return rows
      .map(({ leftAt, ...r }) => ({ ...r, left: leftAt !== null }))
      .sort(
        (a, b) =>
          a.displayName.localeCompare(b.displayName) ||
          a.membershipId.localeCompare(b.membershipId),
      );
  }

  async get(bandId: string, gigId: string): Promise<Lineup> {
    await this.findGig(bandId, gigId);
    return { gigId, members: await this.members(this.db, gigId) };
  }

  /**
   * Replaces the lineup. Members must belong to the band; former members are only
   * accepted when already in this lineup. On a past gig, former members left out of
   * the list stay so history keeps their names.
   */
  async replace(
    bandId: string,
    gigId: string,
    membershipIds: string[],
  ): Promise<Lineup> {
    const gig = await this.findGig(bandId, gigId);
    const wanted = [...new Set(membershipIds)];
    await this.db.transaction(async (tx) => {
      // Serialize concurrent edits of the same gig's lineup.
      await tx
        .select({ id: gigs.id })
        .from(gigs)
        .where(eq(gigs.id, gigId))
        .for("update");
      const current = await tx
        .select({ membershipId: gigLineup.membershipId })
        .from(gigLineup)
        .where(eq(gigLineup.gigId, gigId));
      const inLineup = new Set(current.map((c) => c.membershipId));

      const found = wanted.length
        ? await tx
            .select({ id: memberships.id, leftAt: memberships.leftAt })
            .from(memberships)
            .where(
              and(
                inArray(memberships.id, wanted),
                eq(memberships.bandId, bandId),
              ),
            )
        : [];
      const byId = new Map(found.map((f) => [f.id, f]));
      const invalid = wanted.filter((id) => {
        const m = byId.get(id);
        return !m || (m.leftAt !== null && !inLineup.has(id));
      });
      if (invalid.length > 0) {
        throw new BadRequestException({
          code: SETLIST_ERROR_CODES.invalidMembership,
          message: "Some members are not in this band",
          membershipIds: invalid,
        });
      }

      const keep = new Set(wanted);
      if (gig.date <= new Date().toISOString().slice(0, 10)) {
        const former = inLineup.size
          ? await tx
              .select({ id: memberships.id })
              .from(memberships)
              .where(
                and(
                  inArray(memberships.id, [...inLineup]),
                  sql`${memberships.leftAt} is not null`,
                ),
              )
          : [];
        for (const f of former) keep.add(f.id);
      }
      await tx.delete(gigLineup).where(eq(gigLineup.gigId, gigId));
      if (keep.size > 0) {
        await tx
          .insert(gigLineup)
          .values(
            [...keep].map((membershipId) => ({ bandId, gigId, membershipId })),
          );
      }
    });
    return { gigId, members: await this.members(this.db, gigId) };
  }

  /** Copies the lineup of the latest earlier gig that has one; people who left are skipped. */
  async copyFromLast(bandId: string, gigId: string): Promise<LineupCopyResult> {
    const gig = await this.findGig(bandId, gigId);
    const [source] = await this.db
      .select({ id: gigs.id })
      .from(gigs)
      .where(
        and(
          eq(gigs.bandId, bandId),
          isNull(gigs.deletedAt),
          lt(gigs.date, gig.date),
          sql`exists (select 1 from ${gigLineup} where ${gigLineup.gigId} = ${gigs.id})`,
        ),
      )
      .orderBy(desc(gigs.date), desc(gigs.startsAt), desc(gigs.id))
      .limit(1);
    if (!source) {
      throw new NotFoundException({
        code: SETLIST_ERROR_CODES.noPreviousLineup,
        message: "No earlier gig has a lineup",
      });
    }
    const active = (await this.members(this.db, source.id))
      .filter((m) => !m.left)
      .map((m) => m.membershipId);
    const lineup = await this.replace(bandId, gigId, active);
    return { ...lineup, sourceGigId: source.id };
  }
}
