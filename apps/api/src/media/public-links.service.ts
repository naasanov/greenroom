import { randomBytes } from "node:crypto";
import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import {
  bands,
  gigs,
  publicUploadLinks,
  uploadSessions,
  users,
  type Database,
} from "@greenroom/db";
import {
  DEFAULT_LINK_MAX_FILE_BYTES,
  DEFAULT_LINK_MAX_TOTAL_BYTES,
  DEFAULT_LINK_MIME_PREFIXES,
  UPLOAD_LINK_ERROR_CODES,
  type CreatePublicUpload,
  type PublicUploadLinkInfo,
  type PublicUploadSession,
  type UploadLink,
  type UploadSession,
  type UploadLinkInvalidReason,
} from "@greenroom/shared";
import { webUrl } from "../auth/auth.constants.js";
import { DRIZZLE } from "../db/db.constants.js";
import { DriveStructureService } from "./drive-structure.service.js";
import { UploadsService, type UploadLimits } from "./uploads.service.js";

type LinkRow = typeof publicUploadLinks.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 10;

/** Admin management and anonymous use of per-gig public upload links. */
@Injectable()
export class PublicLinksService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly structure: DriveStructureService,
    private readonly uploads: UploadsService,
  ) {}

  // ---- admin ----

  /** Returns the gig's active link, or makes one (always, when `fresh`). */
  async create(
    bandId: string,
    gigId: string,
    userId: string,
    days: number | undefined,
    fresh: boolean,
  ): Promise<UploadLink> {
    const gig = await this.structure.loadGig(bandId, gigId);
    await this.structure.requireContext(bandId);
    if (!fresh) {
      const active = (await this.rowsForGig(gigId)).find(
        (r) => this.invalidReason(r) === null,
      );
      if (active) return (await this.toDtos([active]))[0]!;
    }
    // The window counts from the gig date, or from today for past gigs.
    const gigDay = new Date(`${gig.date}T00:00:00Z`).getTime();
    const base = Math.max(gigDay, Date.now());
    const expiresAt = new Date(base + ((days ?? 7) + 1) * DAY_MS);
    expiresAt.setUTCHours(0, 0, 0, 0);
    const [row] = await this.db
      .insert(publicUploadLinks)
      .values({
        bandId,
        gigId,
        token: randomBytes(32).toString("base64url"),
        createdByUserId: userId,
        expiresAt,
        maxFileBytes: DEFAULT_LINK_MAX_FILE_BYTES,
        maxTotalBytes: DEFAULT_LINK_MAX_TOTAL_BYTES,
        allowedMimePrefixes: [...DEFAULT_LINK_MIME_PREFIXES],
      })
      .returning();
    return (await this.toDtos([row!]))[0]!;
  }

  async list(bandId: string, gigId: string): Promise<UploadLink[]> {
    await this.structure.loadGig(bandId, gigId);
    return this.toDtos(await this.rowsForGig(gigId));
  }

  async revoke(bandId: string, linkId: string): Promise<UploadLink> {
    const [row] = await this.db
      .select()
      .from(publicUploadLinks)
      .where(
        and(
          eq(publicUploadLinks.id, linkId),
          eq(publicUploadLinks.bandId, bandId),
        ),
      );
    if (!row) throw new NotFoundException("Upload link not found");
    if (row.revokedAt) return (await this.toDtos([row]))[0]!;
    const [updated] = await this.db
      .update(publicUploadLinks)
      .set({ revokedAt: new Date() })
      .where(eq(publicUploadLinks.id, linkId))
      .returning();
    return (await this.toDtos([updated!]))[0]!;
  }

  private rowsForGig(gigId: string): Promise<LinkRow[]> {
    return this.db
      .select()
      .from(publicUploadLinks)
      .where(eq(publicUploadLinks.gigId, gigId))
      .orderBy(desc(publicUploadLinks.createdAt))
      .limit(RECENT_LIMIT);
  }

  private async toDtos(rows: LinkRow[]): Promise<UploadLink[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const usage = await this.db
      .select({
        linkId: uploadSessions.uploadedViaLinkId,
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${uploadSessions.totalBytes}), 0)::float8`,
      })
      .from(uploadSessions)
      .where(
        and(
          inArray(uploadSessions.uploadedViaLinkId, ids),
          notInArray(uploadSessions.status, ["failed", "cancelled"]),
        ),
      )
      .groupBy(uploadSessions.uploadedViaLinkId);
    const byLink = new Map(usage.map((u) => [u.linkId, u]));
    const creatorIds = [
      ...new Set(
        rows.flatMap((r) => (r.createdByUserId ? [r.createdByUserId] : [])),
      ),
    ];
    const creators = creatorIds.length
      ? await this.db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, creatorIds))
      : [];
    const byUser = new Map(creators.map((c) => [c.id, c]));
    return rows.map((r) => ({
      id: r.id,
      url: `${webUrl()}/u/${r.token}`,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdByUserId
        ? (byUser.get(r.createdByUserId) ?? null)
        : null,
      uploadsCount: byLink.get(r.id)?.count ?? 0,
      bytesUsed: byLink.get(r.id)?.bytes ?? 0,
    }));
  }

  // ---- public ----

  async info(token: string): Promise<PublicUploadLinkInfo> {
    const link = await this.resolve(token);
    const [row] = await this.db
      .select({
        bandName: bands.name,
        photoUrl: bands.photoUrl,
        gigTitle: gigs.title,
        gigDate: gigs.date,
      })
      .from(gigs)
      .innerJoin(bands, eq(bands.id, gigs.bandId))
      .where(and(eq(gigs.id, link.gigId), isNull(gigs.deletedAt)));
    if (!row) throw this.invalid("unknown");
    return {
      bandName: row.bandName,
      bandPhotoUrl: row.photoUrl,
      gigTitle: row.gigTitle,
      gigDate: row.gigDate,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      maxFileBytes: link.maxFileBytes ?? DEFAULT_LINK_MAX_FILE_BYTES,
      allowedMimePrefixes: link.allowedMimePrefixes ?? [
        ...DEFAULT_LINK_MIME_PREFIXES,
      ],
    };
  }

  async createUpload(
    token: string,
    input: CreatePublicUpload,
  ): Promise<PublicUploadSession> {
    const link = await this.resolve(token);
    const { uploaderName, ...rest } = input;
    await this.checkTotal(link, input);
    const session = await this.uploads.create(
      { bandId: link.bandId, gigId: link.gigId, linkId: link.id },
      { ...rest, folderId: null, songId: null },
      this.limits(link),
    );
    if (uploaderName) {
      await this.db
        .update(uploadSessions)
        .set({ uploaderName })
        .where(eq(uploadSessions.id, session.id));
    }
    return slim(session);
  }

  async chunk(
    token: string,
    sessionId: string,
    range: { start: number; end: number; total: number },
    data: Buffer,
  ): Promise<PublicUploadSession> {
    const link = await this.resolve(token);
    return slim(
      await this.uploads.chunk(
        link.bandId,
        sessionId,
        { linkId: link.id },
        range,
        data,
      ),
    );
  }

  async cancel(token: string, sessionId: string): Promise<PublicUploadSession> {
    const link = await this.resolve(token);
    return slim(
      await this.uploads.cancel(link.bandId, sessionId, { linkId: link.id }),
    );
  }

  private limits(link: LinkRow): UploadLimits {
    const prefixes = (
      link.allowedMimePrefixes ?? [...DEFAULT_LINK_MIME_PREFIXES]
    ).map((p) => p.toLowerCase());
    return {
      maxFileBytes: link.maxFileBytes ?? DEFAULT_LINK_MAX_FILE_BYTES,
      allowMime: (mime) =>
        prefixes.some((p) => mime.toLowerCase().startsWith(p)),
      unsortedOnly: true,
    };
  }

  /** Rejects a new file when the link's running total would pass its cap. */
  private async checkTotal(
    link: LinkRow,
    input: CreatePublicUpload,
  ): Promise<void> {
    const cap = link.maxTotalBytes ?? DEFAULT_LINK_MAX_TOTAL_BYTES;
    // A repeat of an already-counted file resumes instead of adding bytes.
    const [used] = await this.db
      .select({
        bytes: sql<number>`coalesce(sum(${uploadSessions.totalBytes}) filter (where ${uploadSessions.fileFingerprint} <> ${input.fingerprint}), 0)::float8`,
      })
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.uploadedViaLinkId, link.id),
          notInArray(uploadSessions.status, ["failed", "cancelled"]),
        ),
      );
    if ((used?.bytes ?? 0) + input.totalBytes > cap) {
      throw new UnprocessableEntityException({
        code: UPLOAD_LINK_ERROR_CODES.full,
        message: "This upload link has reached its size limit",
      });
    }
  }

  private invalidReason(link: LinkRow): UploadLinkInvalidReason | null {
    if (link.revokedAt) return "revoked";
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now())
      return "expired";
    return null;
  }

  private invalid(reason: UploadLinkInvalidReason): NotFoundException {
    return new NotFoundException({
      code: UPLOAD_LINK_ERROR_CODES.invalid,
      reason,
      message: "This upload link is not available",
    });
  }

  /** Looks a token up and rejects unknown, revoked, and expired links. */
  private async resolve(token: string): Promise<LinkRow> {
    if (token.length < 20 || token.length > 128) throw this.invalid("unknown");
    const [link] = await this.db
      .select()
      .from(publicUploadLinks)
      .where(eq(publicUploadLinks.token, token));
    if (!link) throw this.invalid("unknown");
    const reason = this.invalidReason(link);
    if (reason) throw this.invalid(reason);
    return link;
  }
}

function slim(s: UploadSession): PublicUploadSession {
  return {
    id: s.id,
    status: s.status,
    bytesReceived: s.bytesReceived,
    totalBytes: s.totalBytes,
    chunkSize: s.chunkSize,
    fileName: s.fileName,
  };
}
