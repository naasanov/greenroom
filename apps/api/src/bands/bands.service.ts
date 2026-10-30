import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import {
  bands,
  feedback,
  gigs,
  inviteLinks,
  bandGoogleLinks,
  mediaItems,
  memberships,
  practiceRsvps,
  practiceSeries,
  publicUploadLinks,
  uploadSessions,
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
  type CreatePlaceholder,
  type InvitePlaceholder,
  type UpdatePlaceholder,
  type InviteLinkInfo,
  type InvitePreview,
  type MyInstruments,
  type SetInstruments,
  type UpdateBand,
} from "@greenroom/shared";
import { webUrl } from "../auth/auth.constants.js";
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
        isPlaceholder: users.isPlaceholder,
        placeholderEmail: users.placeholderEmail,
        placeholderNotes: users.placeholderNotes,
        avatarUrl: users.avatarUrl,
        role: memberships.role,
        joinedAt: memberships.joinedAt,
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
    return rows.map(({ placeholderEmail, placeholderNotes, ...r }) => ({
      ...r,
      email: r.isPlaceholder ? (placeholderEmail ?? "") : r.email,
      notes: r.isPlaceholder ? placeholderNotes : null,
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

  private async assertRealUser(tx: Tx, userId: string): Promise<void> {
    const [u] = await tx
      .select({ isPlaceholder: users.isPlaceholder })
      .from(users)
      .where(eq(users.id, userId));
    if (u?.isPlaceholder) {
      throw new BadRequestException("Roster-only members cannot be admins");
    }
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
      await this.assertRealUser(tx, userId);
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
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.bandId, bandId),
            isNull(memberships.leftAt),
            eq(users.isPlaceholder, false),
          ),
        );
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
    await this.db.transaction((tx) =>
      this.replaceInstruments(tx, userId, input),
    );
    return this.getInstruments(userId);
  }

  private async replaceInstruments(
    tx: Tx,
    userId: string,
    input: SetInstruments,
  ): Promise<void> {
    const presets = [...new Set(input.presets)];
    const seen = new Set<string>();
    const custom = input.custom.filter((c) => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    await tx.delete(userInstruments).where(eq(userInstruments.userId, userId));
    const values = [
      ...presets.map((presetKey) => ({ userId, presetKey })),
      ...custom.map((customName) => ({ userId, customName })),
    ].map((v, position) => ({ ...v, position }));
    if (values.length) await tx.insert(userInstruments).values(values);
  }

  // Roster-only members

  async createPlaceholder(
    bandId: string,
    input: CreatePlaceholder,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const id = randomUUID();
      await tx.insert(users).values({
        id,
        email: `placeholder-${id}@placeholder.invalid`,
        displayName: input.displayName,
        isPlaceholder: true,
        placeholderEmail: input.email ?? null,
        placeholderNotes: input.notes ?? null,
      });
      await tx
        .insert(memberships)
        .values({ bandId, userId: id, role: "member" });
      await this.replaceInstruments(tx, id, input.instruments);
    });
  }

  async updatePlaceholder(
    bandId: string,
    userId: string,
    patch: UpdatePlaceholder,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.activeMembership(tx, bandId, userId);
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      if (!u?.isPlaceholder) throw new NotFoundException("Member not found");
      const set: Partial<typeof users.$inferInsert> = {};
      if (patch.displayName !== undefined) set.displayName = patch.displayName;
      if (patch.email !== undefined) set.placeholderEmail = patch.email;
      if (patch.notes !== undefined) set.placeholderNotes = patch.notes;
      if (Object.keys(set).length) {
        await tx.update(users).set(set).where(eq(users.id, userId));
      }
      if (patch.instruments) {
        await this.replaceInstruments(tx, userId, patch.instruments);
      }
    });
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

  /** Roster-only members the signed-in user could claim; empty if already a member. */
  async invitePlaceholders(
    token: string,
    userId: string,
  ): Promise<InvitePlaceholder[]> {
    const band = await this.bandForToken(token);
    const [mine] = await this.db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.bandId, band.id),
          eq(memberships.userId, userId),
          isNull(memberships.leftAt),
        ),
      );
    if (mine) return [];
    const rows = await this.members(band.id);
    return rows
      .filter((m) => m.isPlaceholder)
      .map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        instruments: m.instruments,
      }));
  }

  /** Joins via the invite and merges the chosen roster-only member into the user. */
  async linkPlaceholder(
    token: string,
    userId: string,
    placeholderUserId: string,
  ): Promise<BandSummary> {
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
      if (existing) return toSummary(band, existing.role);
      const [target] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.bandId, band.id),
            eq(memberships.userId, placeholderUserId),
            isNull(memberships.leftAt),
            eq(users.isPlaceholder, true),
          ),
        );
      if (!target) {
        throw new ConflictException({
          message: "That roster entry is no longer available",
          code: BAND_ERROR_CODES.placeholderNotLinkable,
        });
      }
      await this.mergePlaceholder(tx, placeholderUserId, userId);
      await tx
        .update(users)
        .set({ lastBandId: band.id })
        .where(eq(users.id, userId));
      joined = true;
      return toSummary(band, "member");
    });
    if (joined) await this.calendarSync.bandAcl(band.id);
    return summary;
  }

  /** Repoints every reference to the placeholder at the real user, then deletes it. */
  private async mergePlaceholder(
    tx: Tx,
    from: string,
    to: string,
  ): Promise<void> {
    await tx
      .update(memberships)
      .set({ userId: to })
      .where(eq(memberships.userId, from));
    const have = await tx
      .select()
      .from(userInstruments)
      .where(eq(userInstruments.userId, to));
    const taken = new Set(
      have.map((i) => i.presetKey ?? `c:${i.customName!.toLowerCase()}`),
    );
    const moving = await tx
      .select()
      .from(userInstruments)
      .where(eq(userInstruments.userId, from))
      .orderBy(asc(userInstruments.position));
    let position = have.length;
    for (const i of moving) {
      const key = i.presetKey ?? `c:${i.customName!.toLowerCase()}`;
      if (taken.has(key)) continue;
      taken.add(key);
      await tx
        .update(userInstruments)
        .set({ userId: to, position: position++ })
        .where(eq(userInstruments.id, i.id));
    }
    const mine = await tx
      .select({
        seriesId: practiceRsvps.seriesId,
        originalStart: practiceRsvps.originalStart,
      })
      .from(practiceRsvps)
      .where(eq(practiceRsvps.userId, to));
    for (const r of mine) {
      await tx
        .delete(practiceRsvps)
        .where(
          and(
            eq(practiceRsvps.userId, from),
            eq(practiceRsvps.seriesId, r.seriesId),
            eq(practiceRsvps.originalStart, r.originalStart),
          ),
        );
    }
    await tx
      .update(practiceRsvps)
      .set({ userId: to })
      .where(eq(practiceRsvps.userId, from));
    await tx
      .update(gigs)
      .set({ createdByUserId: to })
      .where(eq(gigs.createdByUserId, from));
    await tx
      .update(practiceSeries)
      .set({ createdByUserId: to })
      .where(eq(practiceSeries.createdByUserId, from));
    await tx
      .update(publicUploadLinks)
      .set({ createdByUserId: to })
      .where(eq(publicUploadLinks.createdByUserId, from));
    await tx
      .update(mediaItems)
      .set({ uploadedByUserId: to })
      .where(eq(mediaItems.uploadedByUserId, from));
    await tx
      .update(uploadSessions)
      .set({ uploadedByUserId: to })
      .where(eq(uploadSessions.uploadedByUserId, from));
    await tx
      .update(feedback)
      .set({ userId: to })
      .where(eq(feedback.userId, from));
    await tx
      .update(bandGoogleLinks)
      .set({ linkedByUserId: to })
      .where(eq(bandGoogleLinks.linkedByUserId, from));
    await tx
      .update(inviteLinks)
      .set({ createdByUserId: to })
      .where(eq(inviteLinks.createdByUserId, from));
    await tx
      .update(bands)
      .set({ driveLinkedByUserId: to })
      .where(eq(bands.driveLinkedByUserId, from));
    await tx
      .update(bands)
      .set({ calendarLinkedByUserId: to })
      .where(eq(bands.calendarLinkedByUserId, from));
    await tx.delete(users).where(eq(users.id, from));
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
