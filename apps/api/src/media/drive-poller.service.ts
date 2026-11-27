import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  driveFileSongLinks,
  driveSyncCursors,
  gigs,
  mediaFolders,
  mediaItems,
  songs,
  type Database,
} from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { GoogleLinksService } from "../google-connect/index.js";
import {
  GOOGLE_DRIVE,
  type DriveChange,
  type DriveFile,
  type GoogleDriveAdapter,
} from "../integrations/index.js";
import { JobsService } from "../jobs/index.js";
import { HeicConversionService } from "./heic-conversion.service.js";
import {
  attachFolderFiles,
  detachMovedFile,
  drivePollLockKey,
  lockDrivePoll,
} from "./folder-song-links.js";
import { isHeic } from "./heic-util.js";
import {
  applyConvertedFile,
  insertSubfolder,
  upsertDriveItem,
} from "./media-ingest.js";
import { FOLDER_MIME } from "./media-util.js";

export const DRIVE_POLL_QUEUE = "drive-changes-poll";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type FolderRow = typeof mediaFolders.$inferSelect;

export interface PollResult {
  bandId: string;
  status: "polled" | "skipped";
  changes: number;
}

/** Reconciles outside-the-app Drive edits into media rows and song links of linked folders. */
@Injectable()
export class DrivePollerService implements OnModuleInit {
  private readonly log = new Logger(DrivePollerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_DRIVE) private readonly drive: GoogleDriveAdapter,
    private readonly links: GoogleLinksService,
    private readonly jobs: JobsService,
    private readonly heic: HeicConversionService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.jobs.register(DRIVE_POLL_QUEUE, () => this.pollAll(), {
      queue: { retryLimit: 0, policy: "singleton" },
    });
    await (await this.jobs.start()).schedule(DRIVE_POLL_QUEUE, "* * * * *");
  }

  /** One pass over every band with Drive linked. */
  async pollAll(wait = false): Promise<PollResult[]> {
    const out: PollResult[] = [];
    for (const bandId of await this.links.listLinkedBands("drive")) {
      try {
        out.push(await this.pollBand(bandId, wait));
      } catch (err) {
        this.log.error(`Drive poll failed for ${bandId}: ${String(err)}`);
      }
    }
    return out;
  }

  /**
   * Applies pending changes for one band and advances its cursor in a single
   * transaction. A per-band advisory lock serialises concurrent passes: a
   * scheduled pass skips when locked, a manual one (wait) queues behind it.
   * HEIC files seen in the pass are converted after the transaction commits.
   */
  async pollBand(bandId: string, wait = false): Promise<PollResult> {
    const skipped: PollResult = { bandId, status: "skipped", changes: 0 };
    const token = await this.links.getAccessToken(bandId, "drive");
    if (!token) return skipped;
    const heic: DriveFile[] = [];
    const result = await this.db.transaction(async (tx) => {
      if (wait) {
        await lockDrivePoll(tx, bandId);
      } else {
        const rows = await tx.execute(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${drivePollLockKey(bandId)}, 0)) as locked`,
        );
        if (!(rows[0] as { locked: boolean } | undefined)?.locked)
          return skipped;
      }
      const [cursor] = await tx
        .select()
        .from(driveSyncCursors)
        .where(eq(driveSyncCursors.bandId, bandId));
      if (!cursor) return skipped;
      const { changes, newStartPageToken } = await this.drive.getChanges(
        token,
        cursor.pageToken,
      );
      const state = await this.loadState(tx, bandId);
      // Folders first so files in a brand-new subfolder resolve in the same pass.
      const ordered = [
        ...changes.filter((c) => c.file?.mimeType === FOLDER_MIME),
        ...changes.filter((c) => c.file?.mimeType !== FOLDER_MIME),
      ];
      for (const change of ordered) {
        const file = await this.apply(tx, bandId, state, change);
        if (file) heic.push(file);
      }
      await tx
        .update(driveSyncCursors)
        .set({ pageToken: newStartPageToken, lastPolledAt: new Date() })
        .where(eq(driveSyncCursors.bandId, bandId));
      return { bandId, status: "polled" as const, changes: changes.length };
    });
    await this.convertHeic(bandId, token, heic);
    return result;
  }

  /**
   * Best effort, outside the poll transaction. The conversion shows up as one
   * more Drive change on the next pass, where the file is already a JPEG.
   */
  private async convertHeic(
    bandId: string,
    token: string,
    files: DriveFile[],
  ): Promise<void> {
    for (const f of files) {
      try {
        const res = await this.heic.convert(token, f);
        if (!res.converted) continue;
        await applyConvertedFile(this.db, bandId, res.file);
      } catch (err) {
        this.log.warn(`HEIC convert failed for ${f.id}: ${String(err)}`);
      }
    }
  }

  private async loadState(tx: Tx, bandId: string) {
    const gigRows = await tx
      .select({ id: gigs.id, driveFolderId: gigs.driveFolderId })
      .from(gigs)
      .where(and(eq(gigs.bandId, bandId), isNull(gigs.deletedAt)));
    const folderRows = await tx
      .select()
      .from(mediaFolders)
      .where(eq(mediaFolders.bandId, bandId));
    const gigByFolder = new Map<string, string>();
    for (const g of gigRows)
      if (g.driveFolderId) gigByFolder.set(g.driveFolderId, g.id);
    const subByDriveId = new Map<string, FolderRow>();
    for (const f of folderRows)
      if (f.driveFolderId) subByDriveId.set(f.driveFolderId, f);
    // Drive folders linked to songs: files landing in them attach to those songs.
    const linkRows = await tx
      .select({
        folder: driveFileSongLinks.driveFileId,
        songId: driveFileSongLinks.songId,
      })
      .from(driveFileSongLinks)
      .innerJoin(songs, eq(songs.id, driveFileSongLinks.songId))
      .where(
        and(
          eq(driveFileSongLinks.bandId, bandId),
          eq(driveFileSongLinks.isFolder, true),
          isNull(songs.deletedAt),
        ),
      );
    const songsByFolder = new Map<string, string[]>();
    for (const r of linkRows)
      songsByFolder.set(r.folder, [
        ...(songsByFolder.get(r.folder) ?? []),
        r.songId,
      ]);
    return { gigByFolder, subByDriveId, songsByFolder };
  }

  private async apply(
    tx: Tx,
    bandId: string,
    state: Awaited<ReturnType<DrivePollerService["loadState"]>>,
    change: DriveChange,
  ): Promise<DriveFile | null> {
    const { gigByFolder, subByDriveId } = state;
    const now = new Date();

    if (change.removed || !change.file) {
      const folder = subByDriveId.get(change.fileId);
      if (folder) {
        await this.dropFolder(tx, state, folder, "missing");
        return null;
      }
      await tx
        .update(mediaItems)
        .set({ missing: true })
        .where(
          and(
            eq(mediaItems.bandId, bandId),
            eq(mediaItems.driveFileId, change.fileId),
          ),
        );
      return null;
    }

    const f = change.file;
    const parentGig = f.parentId ? gigByFolder.get(f.parentId) : undefined;

    if (f.mimeType === FOLDER_MIME) {
      let existing = subByDriveId.get(f.id);
      if (existing && f.trashed) {
        await this.dropFolder(tx, state, existing, "trashed");
        return null;
      }
      if (existing && existing.gigId !== parentGig) {
        await this.dropFolder(tx, state, existing, "removed");
        existing = undefined;
      }
      if (!parentGig || f.trashed) return null;
      if (existing) {
        if (existing.name !== f.name) {
          await tx
            .update(mediaFolders)
            .set({ name: f.name })
            .where(eq(mediaFolders.id, existing.id));
          existing.name = f.name;
        }
        return null;
      }
      const row = await insertSubfolder(tx, bandId, parentGig, f);
      if (row) subByDriveId.set(f.id, row);
      return null;
    }

    // Trashed files keep their song links (shown unavailable), like manual links.
    if (!f.trashed) {
      await detachMovedFile(tx, bandId, f);
      const linked = f.parentId ? state.songsByFolder.get(f.parentId) : null;
      if (f.parentId && linked)
        await attachFolderFiles(tx, bandId, f.parentId, linked, [f]);
    }

    const sub = f.parentId ? subByDriveId.get(f.parentId) : undefined;
    const target = parentGig
      ? { gigId: parentGig, folderId: null as string | null }
      : sub
        ? { gigId: sub.gigId, folderId: sub.id as string | null }
        : null;
    const [existing] = await tx
      .select()
      .from(mediaItems)
      .where(
        and(eq(mediaItems.bandId, bandId), eq(mediaItems.driveFileId, f.id)),
      );

    if (!target) {
      // Moved out of the gig's folders (or never ours): drop it from the app.
      if (existing && !existing.deletedAt)
        await tx
          .update(mediaItems)
          .set({ deletedAt: now })
          .where(eq(mediaItems.id, existing.id));
      return null;
    }
    if (f.trashed) {
      if (existing)
        await tx
          .update(mediaItems)
          .set({ trashedAt: existing.trashedAt ?? now })
          .where(eq(mediaItems.id, existing.id));
      return null;
    }
    await upsertDriveItem(tx, bandId, target, f, existing);
    return isHeic(f.mimeType, f.name) ? f : null;
  }

  /** Removes a subfolder row; its items are hidden according to why it went. */
  private async dropFolder(
    tx: Tx,
    state: Awaited<ReturnType<DrivePollerService["loadState"]>>,
    folder: FolderRow,
    reason: "trashed" | "missing" | "removed",
  ): Promise<void> {
    const now = new Date();
    const inFolder = and(
      eq(mediaItems.folderId, folder.id),
      isNull(mediaItems.deletedAt),
    );
    if (reason === "trashed")
      await tx
        .update(mediaItems)
        .set({ trashedAt: now })
        .where(and(inFolder, isNull(mediaItems.trashedAt)));
    else if (reason === "missing")
      await tx.update(mediaItems).set({ missing: true }).where(inFolder);
    else await tx.update(mediaItems).set({ deletedAt: now }).where(inFolder);
    await tx.delete(mediaFolders).where(eq(mediaFolders.id, folder.id));
    if (folder.driveFolderId) state.subByDriveId.delete(folder.driveFolderId);
  }
}
