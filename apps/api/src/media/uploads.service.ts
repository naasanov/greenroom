import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  type OnModuleInit,
} from "@nestjs/common";
import { and, desc, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import {
  mediaFolders,
  mediaItems,
  songs,
  uploadSessions,
  type Database,
} from "@greenroom/db";
import {
  MAX_UPLOAD_FILE_BYTES,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_ERROR_CODES,
  memberUploadTypeAllowed,
  type CreateUpload,
  type MediaItem,
  type PatchUpload,
  type UploadSession,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import type { DriveFile } from "../integrations/index.js";
import { JobsService } from "../jobs/index.js";
import {
  DriveStructureService,
  type DriveContext,
} from "./drive-structure.service.js";
import { toItemDto } from "./media-util.js";
import { MediaService } from "./media.service.js";

export const UPLOAD_CLEANUP_QUEUE = "upload-sessions-cleanup";
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const CHUNK_ALIGN = 256 * 1024;

type SessionRow = typeof uploadSessions.$inferSelect;

/** Who an upload belongs to: a signed-in member or a public upload link. */
export interface UploadOwner {
  userId?: string;
  linkId?: string;
}

export interface UploadActor extends UploadOwner {
  bandId: string;
  gigId: string;
}

/** Per-caller restrictions; the member defaults apply when omitted. */
export interface UploadLimits {
  maxFileBytes?: number;
  allowMime?: (mime: string) => boolean;
  /** Link uploads always land in Unsorted. */
  unsortedOnly?: boolean;
}

export interface ChunkRange {
  start: number;
  end: number;
  total: number;
}

/** Brokers browser uploads into Drive resumable sessions and tracks progress. */
@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly log = new Logger(UploadsService.name);
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly structure: DriveStructureService,
    private readonly media: MediaService,
    private readonly jobs: JobsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register(
      UPLOAD_CLEANUP_QUEUE,
      async () => void (await this.cleanup()),
      {
        queue: { retryLimit: 0, policy: "singleton" },
      },
    );
    await (
      await this.jobs.start()
    ).schedule(UPLOAD_CLEANUP_QUEUE, "17 4 * * *");
  }

  /** Marks sessions untouched for 7 days as failed. Returns the count. */
  async cleanup(now = new Date()): Promise<number> {
    const rows = await this.db
      .update(uploadSessions)
      .set({ status: "failed" })
      .where(
        and(
          inArray(uploadSessions.status, ["pending", "uploading"]),
          lt(uploadSessions.updatedAt, new Date(now.getTime() - STALE_MS)),
        ),
      )
      .returning({ id: uploadSessions.id });
    if (rows.length) this.log.log(`Marked ${rows.length} stale uploads failed`);
    return rows.length;
  }

  // ---- create / resume ----

  async create(
    actor: UploadActor,
    input: CreateUpload,
    limits: UploadLimits = {},
  ): Promise<UploadSession> {
    const maxBytes = limits.maxFileBytes ?? MAX_UPLOAD_FILE_BYTES;
    const allow = limits.allowMime ?? memberUploadTypeAllowed;
    if (!allow(input.mimeType)) {
      throw new UnprocessableEntityException({
        code: UPLOAD_ERROR_CODES.typeNotAllowed,
        message: "This file type can't be uploaded",
      });
    }
    if (input.totalBytes > maxBytes) {
      throw new UnprocessableEntityException({
        code: UPLOAD_ERROR_CODES.tooLarge,
        message: "File is too large",
      });
    }
    await this.structure.loadGig(actor.bandId, actor.gigId);
    const ctx = await this.structure.requireContext(actor.bandId);
    const folderId = limits.unsortedOnly ? null : input.folderId;
    if (folderId) await this.requireFolder(actor.bandId, actor.gigId, folderId);
    const songId = limits.unsortedOnly ? null : (input.songId ?? null);
    if (songId) await this.requireSong(actor.bandId, songId);

    const key = `create:${actor.gigId}:${actor.userId ?? actor.linkId}:${input.fingerprint}`;
    return this.locked(key, async () => {
      const existing = await this.findExisting(actor, input.fingerprint);
      if (existing) {
        const resumed = await this.locked(existing.id, () =>
          this.resume(existing, ctx),
        );
        if (resumed) return resumed;
      }
      const parent = await this.parentFor(ctx, actor.gigId, folderId);
      const { sessionUri } = await this.structure.drive.startResumableUpload(
        ctx.token,
        {
          name: input.fileName,
          parentId: parent,
          mimeType: input.mimeType,
          totalSize: input.totalBytes,
        },
      );
      const [row] = await this.db
        .insert(uploadSessions)
        .values({
          bandId: actor.bandId,
          gigId: actor.gigId,
          folderId,
          songId,
          uploadedByUserId: actor.userId ?? null,
          uploadedViaLinkId: actor.linkId ?? null,
          fileName: input.fileName,
          mimeType: input.mimeType,
          fileFingerprint: input.fingerprint,
          driveSessionUrl: sessionUri,
          driveParentId: parent,
          totalBytes: input.totalBytes,
          status: "pending",
        })
        .returning();
      return this.dto(row!);
    });
  }

  private async findExisting(
    actor: UploadActor,
    fingerprint: string,
  ): Promise<SessionRow | null> {
    const [row] = await this.db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.gigId, actor.gigId),
          eq(uploadSessions.fileFingerprint, fingerprint),
          ne(uploadSessions.status, "cancelled"),
          actor.userId
            ? eq(uploadSessions.uploadedByUserId, actor.userId)
            : eq(uploadSessions.uploadedViaLinkId, actor.linkId ?? ""),
        ),
      )
      .orderBy(desc(uploadSessions.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Returns the session to hand back, or null when a fresh one must start. */
  private async resume(
    row: SessionRow,
    ctx: DriveContext,
  ): Promise<UploadSession | null> {
    if (row.status === "complete") {
      const item = await this.liveItem(row);
      if (item) return this.dto(row, toItemDto(item));
      await this.db
        .update(uploadSessions)
        .set({ status: "cancelled" })
        .where(eq(uploadSessions.id, row.id));
      return null;
    }
    const synced = await this.reconcile(row, ctx);
    return this.dto(synced.row, synced.item);
  }

  private async liveItem(row: SessionRow) {
    if (!row.mediaItemId) return null;
    const [item] = await this.db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.id, row.mediaItemId),
          isNull(mediaItems.deletedAt),
          isNull(mediaItems.trashedAt),
          eq(mediaItems.missing, false),
        ),
      );
    return item ?? null;
  }

  /** Asks Drive for the authoritative offset; restarts the Drive session if it is gone. */
  private async reconcile(
    row: SessionRow,
    ctx: DriveContext,
  ): Promise<{ row: SessionRow; item?: MediaItem }> {
    if (!row.driveSessionUrl) return { row: await this.restartDrive(row, ctx) };
    const status = await this.structure.drive.getUploadStatus(
      ctx.token,
      row.driveSessionUrl,
      row.totalBytes,
    );
    if (status.status === "session-not-found")
      return { row: await this.restartDrive(row, ctx) };
    if (status.status === "complete")
      return this.finalize(row, ctx, status.file);
    return {
      row: await this.setProgress(row.id, status.receivedBytes),
    };
  }

  private async restartDrive(
    row: SessionRow,
    ctx: DriveContext,
  ): Promise<SessionRow> {
    const parent = await this.parentFor(ctx, row.gigId, row.folderId);
    const { sessionUri } = await this.structure.drive.startResumableUpload(
      ctx.token,
      {
        name: row.fileName,
        parentId: parent,
        mimeType: row.mimeType ?? "application/octet-stream",
        totalSize: row.totalBytes,
      },
    );
    const [updated] = await this.db
      .update(uploadSessions)
      .set({
        driveSessionUrl: sessionUri,
        driveParentId: parent,
        bytesReceived: 0,
        status: "pending",
      })
      .where(eq(uploadSessions.id, row.id))
      .returning();
    return updated!;
  }

  private async setProgress(id: string, bytes: number): Promise<SessionRow> {
    const [row] = await this.db
      .update(uploadSessions)
      .set({
        bytesReceived: bytes,
        status: bytes > 0 ? "uploading" : "pending",
      })
      .where(eq(uploadSessions.id, id))
      .returning();
    return row!;
  }

  // ---- chunks ----

  async chunk(
    bandId: string,
    sessionId: string,
    owner: UploadOwner,
    range: ChunkRange,
    data: Buffer,
  ): Promise<UploadSession> {
    return this.locked(sessionId, async () => {
      const row = await this.owned(bandId, sessionId, owner);
      if (row.status === "complete") return this.dto(row);
      if (row.status === "cancelled") throw this.notActive();
      this.validateChunk(row, range, data);
      const ctx = await this.structure.requireContext(bandId);
      let res;
      try {
        res = await this.structure.drive.uploadChunk(
          ctx.token,
          row.driveSessionUrl ?? "",
          { start: range.start, end: range.end, total: range.total, data },
        );
      } catch (err) {
        return this.afterDriveError(row, ctx, err);
      }
      switch (res.status) {
        case "incomplete":
          return this.dto(await this.setProgress(row.id, res.receivedBytes));
        case "complete": {
          const done = await this.finalize(row, ctx, res.file);
          return this.dto(done.row, done.item);
        }
        case "offset-mismatch": {
          const synced = await this.setProgress(row.id, res.receivedBytes);
          throw this.mismatch(synced.bytesReceived);
        }
        case "session-not-found": {
          const fresh = await this.restartDrive(row, ctx);
          throw this.mismatch(fresh.bytesReceived);
        }
      }
    });
  }

  private validateChunk(row: SessionRow, r: ChunkRange, data: Buffer): void {
    const bad = (message: string) =>
      new UnprocessableEntityException({
        code: UPLOAD_ERROR_CODES.badChunk,
        message,
      });
    if (r.total !== row.totalBytes) throw bad("Total size does not match");
    if (r.start < 0 || r.end < r.start || r.end >= r.total)
      throw bad("Invalid byte range");
    if (data.length !== r.end - r.start + 1)
      throw bad("Body length does not match Content-Range");
    if (r.end + 1 < r.total && data.length % CHUNK_ALIGN !== 0)
      throw bad("Chunks must be a multiple of 256 KiB except the last");
  }

  /** After a failed Drive call, re-sync the offset and tell the client where to resume. */
  private async afterDriveError(
    row: SessionRow,
    ctx: DriveContext,
    err: unknown,
  ): Promise<UploadSession> {
    this.log.warn(`Drive chunk failed for ${row.id}: ${String(err)}`);
    let bytes = row.bytesReceived;
    try {
      const synced = await this.reconcile(row, ctx);
      if (synced.item) return this.dto(synced.row, synced.item);
      bytes = synced.row.bytesReceived;
    } catch (inner) {
      this.log.warn(`Drive status failed for ${row.id}: ${String(inner)}`);
    }
    throw new BadGatewayException({
      code: UPLOAD_ERROR_CODES.driveError,
      message: "Google Drive interrupted the upload; resume from bytesReceived",
      bytesReceived: bytes,
    });
  }

  private mismatch(bytesReceived: number) {
    return new ConflictException({
      code: UPLOAD_ERROR_CODES.offsetMismatch,
      message: "Upload offset mismatch",
      bytesReceived,
    });
  }

  private notActive() {
    return new ConflictException({
      code: UPLOAD_ERROR_CODES.notActive,
      message: "Upload was cancelled",
    });
  }

  // ---- completion ----

  /** Creates the media item from the session's current choices. Runs under the session lock. */
  private async finalize(
    start: SessionRow,
    ctx: DriveContext,
    file: DriveFile,
  ): Promise<{ row: SessionRow; item: MediaItem }> {
    const [row] = await this.db
      .select()
      .from(uploadSessions)
      .where(eq(uploadSessions.id, start.id));
    const s = row!;
    if (s.status === "complete") {
      const existing = s.mediaItemId ? await this.liveItem(s) : null;
      if (existing) return { row: s, item: toItemDto(existing) };
    }
    const drive = this.structure.drive;
    const parent = await this.parentFor(ctx, s.gigId, s.folderId);
    if (file.parentId !== parent) await drive.move(ctx.token, file.id, parent);
    if (file.name !== s.fileName)
      await drive.rename(ctx.token, file.id, s.fileName);
    let songId = s.songId;
    if (songId) {
      const [song] = await this.db
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.id, songId), eq(songs.bandId, s.bandId)));
      if (!song) songId = null;
    }
    const values = {
      bandId: s.bandId,
      gigId: s.gigId,
      folderId: s.folderId,
      driveFileId: file.id,
      name: s.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.size,
      thumbnailUrl: file.thumbnailLink,
      uploadedByUserId: s.uploadedByUserId,
      uploadedViaLinkId: s.uploadedViaLinkId,
      nameCustomized: s.nameCustomized,
    };
    const [inserted] = await this.db
      .insert(mediaItems)
      .values(values)
      .onConflictDoUpdate({
        target: [mediaItems.bandId, mediaItems.driveFileId],
        set: {
          ...values,
          missing: false,
          trashedAt: null,
          deletedAt: null,
        },
      })
      .returning();
    let item = toItemDto(inserted!);
    if (songId) {
      const linked = await this.media.linkSong(
        s.bandId,
        [inserted!.id],
        songId,
      );
      item = linked[0] ?? item;
    }
    const [done] = await this.db
      .update(uploadSessions)
      .set({
        status: "complete",
        bytesReceived: s.totalBytes,
        mediaItemId: inserted!.id,
        driveFileId: file.id,
        songId,
      })
      .where(eq(uploadSessions.id, s.id))
      .returning();
    return { row: done!, item };
  }

  // ---- reads and edits ----

  async get(
    bandId: string,
    sessionId: string,
    owner: UploadOwner,
  ): Promise<UploadSession> {
    return this.dto(await this.owned(bandId, sessionId, owner));
  }

  async listMine(
    bandId: string,
    gigId: string,
    userId: string,
  ): Promise<UploadSession[]> {
    await this.structure.loadGig(bandId, gigId);
    const rows = await this.db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.bandId, bandId),
          eq(uploadSessions.gigId, gigId),
          eq(uploadSessions.uploadedByUserId, userId),
          ne(uploadSessions.status, "cancelled"),
          gt(uploadSessions.createdAt, new Date(Date.now() - STALE_MS)),
        ),
      )
      .orderBy(desc(uploadSessions.createdAt), desc(uploadSessions.id));
    return this.dtos(rows);
  }

  patch(
    bandId: string,
    sessionId: string,
    owner: UploadOwner,
    patch: PatchUpload,
  ): Promise<UploadSession> {
    return this.locked(sessionId, async () => {
      const row = await this.owned(bandId, sessionId, owner);
      return this.dto(await this.applyPatch(row, patch));
    });
  }

  async bulkPatch(
    bandId: string,
    owner: UploadOwner,
    ids: string[],
    patch: { folderId?: string | null; songId?: string | null },
  ): Promise<UploadSession[]> {
    const unique = [...new Set(ids)];
    const rows = await this.db
      .select()
      .from(uploadSessions)
      .where(
        and(
          inArray(uploadSessions.id, unique),
          eq(uploadSessions.bandId, bandId),
        ),
      );
    const mine = rows.filter((r) => this.isOwner(r, owner));
    if (mine.length !== unique.length)
      throw new NotFoundException("Upload not found");
    const out: UploadSession[] = [];
    for (const r of mine) {
      out.push(await this.patch(bandId, r.id, owner, patch as PatchUpload));
    }
    return out;
  }

  private async applyPatch(
    row: SessionRow,
    patch: PatchUpload,
  ): Promise<SessionRow> {
    if (row.status === "cancelled") throw this.notActive();
    if (patch.folderId)
      await this.requireFolder(row.bandId, row.gigId, patch.folderId);
    if (patch.songId) await this.requireSong(row.bandId, patch.songId);
    if (row.status === "complete" && row.mediaItemId) {
      const id = row.mediaItemId;
      if (patch.fileName !== undefined)
        await this.media.renameItem(row.bandId, id, patch.fileName);
      if (patch.folderId !== undefined)
        await this.media.moveItems(row.bandId, [id], patch.folderId);
      if (patch.songId !== undefined)
        await this.media.linkSong(row.bandId, [id], patch.songId);
    }
    const set: Partial<typeof uploadSessions.$inferInsert> = {};
    if (patch.folderId !== undefined) set.folderId = patch.folderId;
    if (patch.songId !== undefined) set.songId = patch.songId;
    if (patch.fileName !== undefined) {
      set.fileName = patch.fileName;
      set.nameCustomized = true;
    }
    const [updated] = await this.db
      .update(uploadSessions)
      .set(set)
      .where(eq(uploadSessions.id, row.id))
      .returning();
    return updated!;
  }

  cancel(
    bandId: string,
    sessionId: string,
    owner: UploadOwner,
  ): Promise<UploadSession> {
    return this.locked(sessionId, async () => {
      const row = await this.owned(bandId, sessionId, owner);
      if (row.status === "complete") throw this.notActive();
      // The Drive session is abandoned; it expires on Google's side.
      const [updated] = await this.db
        .update(uploadSessions)
        .set({ status: "cancelled", driveSessionUrl: null })
        .where(eq(uploadSessions.id, row.id))
        .returning();
      return this.dto(updated!);
    });
  }

  // ---- helpers ----

  private isOwner(row: SessionRow, owner: UploadOwner): boolean {
    if (owner.userId) return row.uploadedByUserId === owner.userId;
    if (owner.linkId) return row.uploadedViaLinkId === owner.linkId;
    return false;
  }

  private async owned(
    bandId: string,
    sessionId: string,
    owner: UploadOwner,
  ): Promise<SessionRow> {
    const [row] = await this.db
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.id, sessionId),
          eq(uploadSessions.bandId, bandId),
        ),
      );
    if (!row || !this.isOwner(row, owner))
      throw new NotFoundException("Upload not found");
    return row;
  }

  private async requireFolder(
    bandId: string,
    gigId: string,
    folderId: string,
  ): Promise<void> {
    const [f] = await this.db
      .select()
      .from(mediaFolders)
      .where(
        and(eq(mediaFolders.id, folderId), eq(mediaFolders.bandId, bandId)),
      );
    if (!f || f.gigId !== gigId || !f.driveFolderId)
      throw new UnprocessableEntityException("Folder not found for this gig");
  }

  private async requireSong(bandId: string, songId: string): Promise<void> {
    const [s] = await this.db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.bandId, bandId)));
    if (!s) throw new UnprocessableEntityException("Song not found");
  }

  /** Drive parent for a folder choice; a deleted folder falls back to the gig folder. */
  private async parentFor(
    ctx: DriveContext,
    gigId: string,
    folderId: string | null,
  ): Promise<string> {
    if (folderId) {
      const [f] = await this.db
        .select()
        .from(mediaFolders)
        .where(eq(mediaFolders.id, folderId));
      if (f?.driveFolderId) return f.driveFolderId;
    }
    return this.structure.ensureGigFolder(ctx, gigId);
  }

  private async dto(row: SessionRow, item?: MediaItem): Promise<UploadSession> {
    if (item) return toDto(row, item);
    const live = row.mediaItemId ? await this.itemById(row.mediaItemId) : null;
    return toDto(row, live ? toItemDto(live) : null);
  }

  private async dtos(rows: SessionRow[]): Promise<UploadSession[]> {
    const ids = rows.flatMap((r) => (r.mediaItemId ? [r.mediaItemId] : []));
    const items = ids.length
      ? await this.db
          .select()
          .from(mediaItems)
          .where(and(inArray(mediaItems.id, ids), isNull(mediaItems.deletedAt)))
      : [];
    const byId = new Map(items.map((i) => [i.id, i]));
    return rows.map((r) => {
      const i = r.mediaItemId ? byId.get(r.mediaItemId) : undefined;
      return toDto(r, i ? toItemDto(i) : null);
    });
  }

  private async itemById(id: string) {
    const [i] = await this.db
      .select()
      .from(mediaItems)
      .where(and(eq(mediaItems.id, id), isNull(mediaItems.deletedAt)));
    return i ?? null;
  }

  /** Serialises work per key within this process. */
  private locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(key, tail);
    void tail.then(() => {
      if (this.locks.get(key) === tail) this.locks.delete(key);
    });
    return run;
  }
}

function toDto(row: SessionRow, item: MediaItem | null): UploadSession {
  return {
    id: row.id,
    gigId: row.gigId,
    status: row.status,
    bytesReceived: row.bytesReceived,
    totalBytes: row.totalBytes,
    chunkSize: UPLOAD_CHUNK_BYTES,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fingerprint: row.fileFingerprint,
    folderId: row.folderId,
    songId: row.songId,
    createdAt: row.createdAt.toISOString(),
    item,
  };
}
