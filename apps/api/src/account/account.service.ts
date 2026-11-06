import { ConflictException, Inject, Injectable, Logger } from "@nestjs/common";
import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import {
  bands,
  feedback,
  magicLinkTokens,
  memberships,
  oauthConnections,
  oauthStates,
  sessions,
  userInstruments,
  userPhotos,
  users,
  type Database,
} from "@greenroom/db";
import {
  ACCOUNT_ERROR_CODES,
  type AccountBand,
  type DeletionPreview,
  type User,
} from "@greenroom/shared";
import { decryptToken } from "../common/token-crypto.js";
import { BandsService } from "../bands/bands.service.js";
import { CalendarInviteQueue } from "../calendar-invites/calendar-invite.queue.js";
import { CalendarSyncQueue } from "../calendar-sync/calendar-sync.queue.js";
import { DRIZZLE } from "../db/db.constants.js";
import {
  GOOGLE_OAUTH,
  type GoogleOAuthAdapter,
} from "../integrations/index.js";
import { ProfilePhotosService } from "../media/profile-photos.service.js";

type Reader = Pick<Database, "select">;

@Injectable()
export class AccountService {
  private readonly log = new Logger(AccountService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_OAUTH) private readonly google: GoogleOAuthAdapter,
    private readonly bandsService: BandsService,
    private readonly photos: ProfilePhotosService,
    private readonly calendarSync: CalendarSyncQueue,
    private readonly invites: CalendarInviteQueue,
  ) {}

  /** Classifies each active band: deleted (sole member), left, or blocked (last admin with others). */
  private async plan(db: Reader, userId: string): Promise<DeletionPreview> {
    const mine = await db
      .select({
        bandId: bands.id,
        name: bands.name,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(bands, eq(bands.id, memberships.bandId))
      .where(and(eq(memberships.userId, userId), isNull(memberships.leftAt)))
      .orderBy(asc(memberships.joinedAt));
    const out: DeletionPreview = {
      deleteBands: [],
      leaveBands: [],
      blockedBands: [],
    };
    for (const m of mine) {
      const band: AccountBand = { id: m.bandId, name: m.name };
      const [others] = await db
        .select({ n: count() })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(memberships.bandId, m.bandId),
            isNull(memberships.leftAt),
            eq(users.isPlaceholder, false),
            ne(memberships.userId, userId),
          ),
        );
      if (others!.n === 0) {
        out.deleteBands.push(band);
        continue;
      }
      let blocked = false;
      if (m.role === "admin") {
        const [admins] = await db
          .select({ n: count() })
          .from(memberships)
          .where(
            and(
              eq(memberships.bandId, m.bandId),
              eq(memberships.role, "admin"),
              isNull(memberships.leftAt),
            ),
          );
        blocked = admins!.n <= 1;
      }
      (blocked ? out.blockedBands : out.leaveBands).push(band);
    }
    return out;
  }

  preview(userId: string): Promise<DeletionPreview> {
    return this.plan(this.db, userId);
  }

  /** Leaves or deletes every band, scrubs personal data, and keeps the row for lineup history. */
  async deleteAccount(user: User): Promise<void> {
    const userId = user.id;
    const copies = await this.db
      .select({
        bandId: memberships.bandId,
        fileId: memberships.photoDriveFileId,
      })
      .from(memberships)
      .where(eq(memberships.userId, userId));
    const connections = await this.db
      .select()
      .from(oauthConnections)
      .where(eq(oauthConnections.userId, userId));

    const result = await this.db.transaction(async (tx) => {
      const plan = await this.plan(tx, userId);
      if (plan.blockedBands.length > 0) {
        throw new ConflictException({
          message: "Promote another admin in these bands first",
          code: ACCOUNT_ERROR_CODES.lastAdmin,
          bands: plan.blockedBands,
        });
      }
      for (const b of [...plan.deleteBands, ...plan.leaveBands]) {
        await this.bandsService.leaveInTx(tx, b.id, userId, true);
      }
      await tx
        .update(memberships)
        .set({ photoDriveFileId: null })
        .where(eq(memberships.userId, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx
        .delete(oauthConnections)
        .where(eq(oauthConnections.userId, userId));
      await tx.delete(oauthStates).where(eq(oauthStates.userId, userId));
      await tx.delete(userPhotos).where(eq(userPhotos.userId, userId));
      await tx
        .delete(userInstruments)
        .where(eq(userInstruments.userId, userId));
      await tx
        .delete(magicLinkTokens)
        .where(eq(magicLinkTokens.email, user.email));
      await tx
        .update(feedback)
        .set({ userId: null })
        .where(eq(feedback.userId, userId));
      await tx
        .update(users)
        .set({
          email: `deleted-${userId}@deleted.invalid`,
          googleSub: null,
          avatarUrl: null,
          calendarEmail: null,
          lastBandId: null,
          placeholderEmail: null,
          placeholderNotes: null,
        })
        .where(eq(users.id, userId));
      return plan;
    });

    const deleted = new Set(result.deleteBands.map((b) => b.id));
    await Promise.all(
      result.leaveBands.map(async (b) => {
        await this.calendarSync.bandAcl(b.id).catch(() => undefined);
        await this.invites.band(b.id);
      }),
    );
    await this.photos.trashMemberCopies(
      copies.flatMap((c) =>
        c.fileId && !deleted.has(c.bandId)
          ? [{ bandId: c.bandId, fileId: c.fileId }]
          : [],
      ),
    );
    for (const c of connections) {
      if (c.provider !== "google") continue;
      try {
        await this.google.revokeToken(decryptToken(c.refreshTokenEncrypted));
      } catch (err) {
        this.log.warn(`token revoke failed: ${String(err)}`);
      }
    }
  }
}
