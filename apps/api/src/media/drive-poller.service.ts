import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  driveSyncCursors,
  gigs,
  mediaFolders,
  mediaItems,
  type Database,
} from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import { GoogleLinksService } from "../google-connect/index.js";
import {
  GOOGLE_DRIVE,
  type DriveChange,
  type GoogleDriveAdapter,
} from "../integrations/index.js";
import { JobsService } from "../jobs/index.js";
import { FOLDER_MIME } from "./media-util.js";

export const DRIVE_POLL_QUEUE = "drive-changes-poll";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type FolderRow = typeof mediaFolders.$inferSelect;

export interface PollResult {
  bandId: string;
  status: "polled" | "skipped";
  changes: number;
}

/** Reconciles outside-the-app Drive edits into media_items and media_folders. */
@Injectable()
export class DrivePollerService implements OnModuleInit {
  private readonly log = new Logger(DrivePollerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_DRIVE) private readonly drive: GoogleDriveAdapter,
    private readonly links: GoogleLinksService,
    private readonly jobs: JobsService,
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
   */
  async pollBand(bandId: string, wait = false): Promise<PollResult> {
    const skipped: PollResult = { bandId, status: "skipped", changes: 0 };
    const token = await this.links.getAccessToken(bandId, "drive");
    if (!token) return skipped;
    return this.db.transaction(async (tx) => {
      const key = `drive-poll:${bandId}`;
      if (wait) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
        );
      } else {
        const rows = await tx.execute(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as locked`,
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
      for (const change of ordered) await this.apply(tx, bandId, state, change);
      await tx
        .update(driveSyncCursors)
        .set({ pageToken: newStartPageToken, lastPolledAt: new Date() })
        .where(eq(driveSyncCursors.bandId, bandId));
      return { bandId, status: "polled" as const, changes: changes.length };
    });
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
    return { gigByFolder, subByDriveId };
  }

  private async apply(
    tx: Tx,
    bandId: string,
    state: Awaited<ReturnType<DrivePollerService["loadState"]>>,
    change: DriveChange,
  ): Promise<void> {
    const { gigByFolder, subByDriveId } = state;
    const now = new Date();

    if (change.removed || !change.file) {
      const folder = subByDriveId.get(change.fileId);
      if (folder) {
        await this.dropFolder(tx, state, folder, "missing");
        return;
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
      return;
    }

    const f = change.file;
    const parentGig = f.parentId ? gigByFolder.get(f.parentId) : undefined;

    if (f.mimeType === FOLDER_MIME) {
      let existing = subByDriveId.get(f.id);
      if (existing && f.trashed) {
        await this.dropFolder(tx, state, existing, "trashed");
        return;
      }
      if (existing && existing.gigId !== parentGig) {
        await this.dropFolder(tx, state, existing, "removed");
        existing = undefined;
      }
      if (!parentGig || f.trashed) return;
      if (existing) {
        if (existing.name !== f.name) {
          await tx
            .update(mediaFolders)
            .set({ name: f.name })
            .where(eq(mediaFolders.id, existing.id));
          existing.name = f.name;
        }
        return;
      }
      const [{ next }] = await tx
        .select({
          next: sql<number>`coalesce(max(${mediaFolders.position}), -1) + 1`,
        })
        .from(mediaFolders)
        .where(eq(mediaFolders.gigId, parentGig));
      const [row] = await tx
        .insert(mediaFolders)
        .values({
          bandId,
          gigId: parentGig,
          name: f.name,
          driveFolderId: f.id,
          position: Number(next),
        })
        .onConflictDoNothing()
        .returning();
      if (row) subByDriveId.set(f.id, row);
      return;
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
      return;
    }
    if (f.trashed) {
      if (existing)
        await tx
          .update(mediaItems)
          .set({ trashedAt: existing.trashedAt ?? now })
          .where(eq(mediaItems.id, existing.id));
      return;
    }
    await tx
      .insert(mediaItems)
      .values({
        bandId,
        gigId: target.gigId,
        folderId: target.folderId,
        driveFileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        sizeBytes: f.size,
        thumbnailUrl: f.thumbnailLink,
        createdAt: new Date(f.createdTime),
      })
      .onConflictDoUpdate({
        target: [mediaItems.bandId, mediaItems.driveFileId],
        set: {
          gigId: target.gigId,
          folderId: target.folderId,
          name: f.name,
          // A rename seen in Drive stops song-title auto-renames.
          nameCustomized: existing
            ? existing.nameCustomized || existing.name !== f.name
            : false,
          mimeType: f.mimeType,
          sizeBytes: f.size,
          thumbnailUrl: f.thumbnailLink,
          missing: false,
          trashedAt: null,
          deletedAt: null,
          updatedAt: now,
        },
      });
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
