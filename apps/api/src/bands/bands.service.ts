import { randomBytes } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import {
  bands,
  inviteLinks,
  memberships,
  userInstruments,
  users,
  type Database,
} from "@greenroom/db";
import {
  BAND_ERROR_CODES,
  type BandDetail,
  type BandMember,
  type BandRole,
  type BandSummary,
  type InviteLinkInfo,
  type InvitePreview,
  type MyInstruments,
  type SetInstruments,
  type UpdateBand,
} from "@greenroom/shared";
import { webUrl } from "../auth/auth.constants.js";
import { memberPhotoUrl } from "../media/media-util.js";
import { CalendarSyncQueue } from "../calendar-sync/calendar-sync.queue.js";
import { DRIZZLE } from "../db/db.constants.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const slugify = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "band";

const newInviteToken = (): string => randomBytes(24).toString("base64url");

const toSummary = (
  b: typeof bands.$inferSelect,
  role: BandRole,
): BandSummary => ({
  id: b.id,
  name: b.name,
  slug: b.slug,
  photoUrl: b.photoUrl,
  role,
});

@Injectable()
export class BandsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly calendarSync: CalendarSyncQueue,
  ) {}

  private async uniqueSlug(tx: Tx, name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    for (;;) {
      const [hit] = await tx
        .select({ id: bands.id })
        .from(bands)
        .where(eq(bands.slug, slug));
      if (!hit) return slug;
      slug = `${base}-${randomBytes(3).toString("hex")}`;
    }
  }

  async create(userId: string, name: string): Promise<BandSummary> {
    return this.db.transaction(async (tx) => {
      const slug = await this.uniqueSlug(tx, name);
      const [band] = await tx.insert(bands).values({ name, slug }).returning();
      await tx
        .insert(memberships)
        .values({ bandId: band!.id, userId, role: "admin" });
      await tx
        .update(users)
        .set({ lastBandId: band!.id })
        .where(eq(users.id, userId));
      return toSummary(band!, "admin");
    });
  }

  async listForUser(userId: string): Promise<BandSummary[]> {
    const rows = await this.db
      .select({ band: bands, role: memberships.role })
      .from(memberships)
      .innerJoin(bands, eq(bands.id, memberships.bandId))
      .where(and(eq(memberships.userId, userId), isNull(memberships.leftAt)))
      .orderBy(asc(memberships.joinedAt));
    return rows.map((r) => toSummary(r.band, r.role));
  }

  async detail(bandId: string, role: BandRole): Promise<BandDetail> {
    const [band] = await this.db
      .select()
      .from(bands)
      .where(eq(bands.id, bandId));
    if (!band) throw new NotFoundException("Band not found");
    return this.toDetail(band, role);
  }

  private toDetail(
    band: typeof bands.$inferSelect,
    role: BandRole,
  ): BandDetail {
    return {
      ...toSummary(band, role),
      bio: band.bio,
      socialLinks: band.socialLinks,
      bookingContact: band.bookingContact,
      createdAt: band.createdAt.toISOString(),
    };
  }

  async update(
    bandId: string,
    role: BandRole,
    patch: UpdateBand,
  ): Promise<BandDetail> {
    if (Object.keys(patch).length === 0) return this.detail(bandId, role);
    const [band] = await this.db
      .update(bands)
      .set(patch)
      .where(eq(bands.id, bandId))
      .returning();
    if (!band) throw new NotFoundException("Band not found");
    return this.toDetail(band, role);
  }

  async members(bandId: string): Promise<BandMember[]> {
    const rows = await this.db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        role: memberships.role,
        joinedAt: memberships.joinedAt,
        photoDriveFileId: memberships.photoDriveFileId,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.bandId, bandId), isNull(memberships.leftAt)))
      .orderBy(asc(memberships.joinedAt), asc(users.displayName));
    const instruments = rows.length
      ? await this.db
          .select()
          .from(userInstruments)
          .where(
            inArray(
              userInstruments.userId,
              rows.map((r) => r.userId),
            ),
          )
          .orderBy(asc(userInstruments.position))
      : [];
    return rows.map(({ photoDriveFileId, ...r }) => ({
      ...r,
      photoUrl: memberPhotoUrl(bandId, r.userId, photoDriveFileId),
      joinedAt: r.joinedAt.toISOString(),
      instruments: groupInstruments(
        instruments.filter((i) => i.userId === r.userId),
      ),
    }));
  }

  /** Locks the band row so concurrent role changes and leaves serialize. */
  private async lockBand(tx: Tx, bandId: string): Promise<void> {
    await tx
      .select({ id: bands.id })
      .from(bands)
      .where(eq(bands.id, bandId))
      .for("update");
  }

  private async activeMembership(tx: Tx, bandId: string, userId: string) {
    const [m] = await tx
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.bandId, bandId),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
        ),
      );
    if (!m) throw new NotFoundException("Member not found");
    return m;
  }

  private async adminCount(tx: Tx, bandId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(memberships)
      .where(
        and(
          eq(memberships.bandId, bandId),
          eq(memberships.role, "admin"),
          isNull(memberships.leftAt),
        ),
      );
    return row!.n;
  }

  private lastAdmin(): ConflictException {
    return new ConflictException({
      message: "A band needs at least one admin",
      code: BAND_ERROR_CODES.lastAdmin,
    });
  }

  async setRole(bandId: string, userId: string, role: BandRole): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockBand(tx, bandId);
      const m = await this.activeMembership(tx, bandId, userId);
      if (
        m.role === "admin" &&
        role !== "admin" &&
        (await this.adminCount(tx, bandId)) <= 1
      ) {
        throw this.lastAdmin();
      }
      await tx
        .update(memberships)
        .set({ role })
        .where(eq(memberships.id, m.id));
    });
  }

  /** Soft-removes a member; used for admin removal and for plain leaves. */
  async removeMember(bandId: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockBand(tx, bandId);
      const m = await this.activeMembership(tx, bandId, userId);
      if (m.role === "admin" && (await this.adminCount(tx, bandId)) <= 1) {
        throw this.lastAdmin();
      }
      await tx
        .update(memberships)
        .set({ leftAt: new Date() })
        .where(eq(memberships.id, m.id));
    });
    await this.calendarSync.bandAcl(bandId);
  }

  async leave(
    bandId: string,
    userId: string,
    deleteBand: boolean,
  ): Promise<void> {
    let bandDeleted = false;
    await this.db.transaction(async (tx) => {
      await this.lockBand(tx, bandId);
      const m = await this.activeMembership(tx, bandId, userId);
      const [total] = await tx
        .select({ n: count() })
        .from(memberships)
        .where(and(eq(memberships.bandId, bandId), isNull(memberships.leftAt)));
      if (total!.n <= 1) {
        if (!deleteBand) {
          throw new ConflictException({
            message: "You are the only member; leaving deletes the band",
            code: BAND_ERROR_CODES.onlyMemberMustDelete,
          });
        }
        await tx.delete(bands).where(eq(bands.id, bandId));
        bandDeleted = true;
        return;
      }
      if (m.role === "admin" && (await this.adminCount(tx, bandId)) <= 1) {
        throw this.lastAdmin();
      }
      await tx
        .update(memberships)
        .set({ leftAt: new Date() })
        .where(eq(memberships.id, m.id));
    });
    if (!bandDeleted) await this.calendarSync.bandAcl(bandId);
  }

  // Instruments

  async getInstruments(userId: string): Promise<MyInstruments> {
    const rows = await this.db
      .select()
      .from(userInstruments)
      .where(eq(userInstruments.userId, userId))
      .orderBy(asc(userInstruments.position));
    return groupInstruments(rows);
  }

  async setInstruments(
    userId: string,
    input: SetInstruments,
  ): Promise<MyInstruments> {
    const presets = [...new Set(input.presets)];
    const seen = new Set<string>();
    const custom = input.custom.filter((c) => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await this.db.transaction(async (tx) => {
      await tx
        .delete(userInstruments)
        .where(eq(userInstruments.userId, userId));
      const values = [
        ...presets.map((presetKey) => ({ userId, presetKey })),
        ...custom.map((customName) => ({ userId, customName })),
      ].map((v, position) => ({ ...v, position }));
      if (values.length) await tx.insert(userInstruments).values(values);
    });
    return this.getInstruments(userId);
  }

  // Invites

  private toInviteInfo(row: typeof inviteLinks.$inferSelect): InviteLinkInfo {
    return {
      token: row.token,
      url: `${webUrl()}/invite/${row.token}`,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async getOrCreateInvite(
    bandId: string,
    userId: string,
  ): Promise<InviteLinkInfo> {
    return this.db.transaction(async (tx) => {
      await this.lockBand(tx, bandId);
      const [active] = await tx
        .select()
        .from(inviteLinks)
        .where(
          and(eq(inviteLinks.bandId, bandId), isNull(inviteLinks.revokedAt)),
        )
        .orderBy(asc(inviteLinks.createdAt));
      if (active) return this.toInviteInfo(active);
      const [created] = await tx
        .insert(inviteLinks)
        .values({ bandId, token: newInviteToken(), createdByUserId: userId })
        .returning();
      return this.toInviteInfo(created!);
    });
  }

  async resetInvite(bandId: string, userId: string): Promise<InviteLinkInfo> {
    return this.db.transaction(async (tx) => {
      await this.lockBand(tx, bandId);
      await tx
        .update(inviteLinks)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(inviteLinks.bandId, bandId), isNull(inviteLinks.revokedAt)),
        );
      const [created] = await tx
        .insert(inviteLinks)
        .values({ bandId, token: newInviteToken(), createdByUserId: userId })
        .returning();
      return this.toInviteInfo(created!);
    });
  }

  private async bandForToken(token: string) {
    const [row] = await this.db
      .select({ band: bands })
      .from(inviteLinks)
      .innerJoin(bands, eq(bands.id, inviteLinks.bandId))
      .where(and(eq(inviteLinks.token, token), isNull(inviteLinks.revokedAt)));
    if (!row) throw new NotFoundException("Invite not found");
    return row.band;
  }

  async previewInvite(token: string): Promise<InvitePreview> {
    const band = await this.bandForToken(token);
    const [row] = await this.db
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.bandId, band.id), isNull(memberships.leftAt)));
    return {
      band: { name: band.name, photoUrl: band.photoUrl },
      memberCount: row!.n,
    };
  }

  async acceptInvite(token: string, userId: string): Promise<BandSummary> {
    const band = await this.bandForToken(token);
    let joined = false;
    const summary = await this.db.transaction(async (tx) => {
      await this.lockBand(tx, band.id);
      const [existing] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.bandId, band.id),
            eq(memberships.userId, userId),
            isNull(memberships.leftAt),
          ),
        );
      if (!existing) {
        await tx
          .insert(memberships)
          .values({ bandId: band.id, userId, role: "member" });
        joined = true;
      }
      await tx
        .update(users)
        .set({ lastBandId: band.id })
        .where(eq(users.id, userId));
      if (existing) return toSummary(band, existing.role);
      return toSummary(band, "member");
    });
    if (joined) await this.calendarSync.bandAcl(band.id);
    return summary;
  }

  /** Sets the user's last used band; 404 unless they are an active member. */
  async setCurrentBand(userId: string, bandId: string): Promise<void> {
    const [m] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.bandId, bandId),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
        ),
      );
    if (!m) throw new NotFoundException("Band not found");
    await this.db
      .update(users)
      .set({ lastBandId: bandId })
      .where(eq(users.id, userId));
  }
}

function groupInstruments(
  rows: { presetKey: string | null; customName: string | null }[],
): MyInstruments {
  return {
    presets: rows.flatMap((r) => (r.presetKey ? [r.presetKey] : [])),
    custom: rows.flatMap((r) => (r.customName ? [r.customName] : [])),
  };
}
