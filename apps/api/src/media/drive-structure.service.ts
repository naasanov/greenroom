import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { bands, driveSyncCursors, gigs, type Database } from "@greenroom/db";
import { MEDIA_ERROR_CODES, type DriveStatus } from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { GoogleLinksService } from "../google-connect/index.js";
import {
  DRIVE_FOLDER_MIME,
  GOOGLE_DRIVE,
  type GoogleDriveAdapter,
} from "../integrations/index.js";
import { driveFolderUrl } from "./media-util.js";

export interface DriveContext {
  token: string;
  bandId: string;
  rootFolderId: string;
  gigsFolderId: string;
  photosFolderId: string;
}

export const NOT_LINKED = {
  code: "GOOGLE_NOT_LINKED",
  message: "Google Drive is not linked",
} as const;

/** Owns the band's Drive folder layout: root pointers and per-gig folders. */
@Injectable()
export class DriveStructureService {
  private gigLocks = new Map<string, Promise<string>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(GOOGLE_DRIVE) readonly drive: GoogleDriveAdapter,
    private readonly links: GoogleLinksService,
  ) {}

  /** Null when Drive is unlinked, revoked, or no folder has been chosen. */
  async context(bandId: string): Promise<DriveContext | null> {
    const [band] = await this.db
      .select()
      .from(bands)
      .where(eq(bands.id, bandId));
    if (
      !band?.driveRootFolderId ||
      !band.driveGigsFolderId ||
      !band.drivePhotosFolderId
    )
      return null;
    const token = await this.links.getAccessToken(bandId, "drive");
    if (!token) return null;
    return {
      token,
      bandId,
      rootFolderId: band.driveRootFolderId,
      gigsFolderId: band.driveGigsFolderId,
      photosFolderId: band.drivePhotosFolderId,
    };
  }

  async requireContext(bandId: string): Promise<DriveContext> {
    const ctx = await this.context(bandId);
    if (!ctx) throw new ConflictException(NOT_LINKED);
    return ctx;
  }

  async status(bandId: string): Promise<DriveStatus> {
    const [band] = await this.db
      .select()
      .from(bands)
      .where(eq(bands.id, bandId));
    if (!band) throw new NotFoundException("Band not found");
    const link = await this.links.getLink(bandId, "drive");
    const folderSet = !!(
      band.driveRootFolderId &&
      band.driveGigsFolderId &&
      band.drivePhotosFolderId
    );
    let folderName: string | null = null;
    if (link && band.driveRootFolderId) {
      const token = await this.links.getAccessToken(bandId, "drive");
      const found = token
        ? await this.drive
            .getFile(token, band.driveRootFolderId)
            .catch(() => null)
        : null;
      if (found?.status === "ok") folderName = found.file.name;
    }
    return {
      linked: !!link,
      folderSet: !!link && folderSet,
      folderId: band.driveRootFolderId,
      folderName,
      folderUrl: band.driveRootFolderId
        ? driveFolderUrl(band.driveRootFolderId)
        : null,
      gigsFolderId: band.driveGigsFolderId,
      photosFolderId: band.drivePhotosFolderId,
    };
  }

  /** Creates a folder in My Drive root and makes it the band's folder. */
  async createRootFolder(bandId: string, name: string): Promise<DriveStatus> {
    const token = await this.links.getAccessToken(bandId, "drive");
    if (!token) throw new ConflictException(NOT_LINKED);
    const folder = await this.drive.createFolder(token, {
      name,
      parentId: "root",
    });
    return this.setRootFolder(bandId, folder.id);
  }

  /** Points the band at a chosen folder and builds or reuses its structure folders. */
  async setRootFolder(bandId: string, folderId: string): Promise<DriveStatus> {
    const token = await this.links.getAccessToken(bandId, "drive");
    if (!token) throw new ConflictException(NOT_LINKED);
    const found = await this.drive.getFile(token, folderId);
    if (
      found.status !== "ok" ||
      found.file.mimeType !== DRIVE_FOLDER_MIME ||
      found.file.trashed
    ) {
      throw new UnprocessableEntityException({
        code: MEDIA_ERROR_CODES.notAFolder,
        message: "The chosen item is not a folder in Drive",
      });
    }
    const children = await this.drive.listChildren(token, folderId);
    const reuse = (name: string) =>
      children.find((c) => c.mimeType === DRIVE_FOLDER_MIME && c.name === name);
    const gigs_ =
      reuse("Gigs") ??
      (await this.drive.createFolder(token, {
        name: "Gigs",
        parentId: folderId,
      }));
    const photos =
      reuse("Profile photos") ??
      (await this.drive.createFolder(token, {
        name: "Profile photos",
        parentId: folderId,
      }));
    const [before] = await this.db
      .select({ root: bands.driveRootFolderId })
      .from(bands)
      .where(eq(bands.id, bandId));
    await this.db
      .update(bands)
      .set({
        driveRootFolderId: folderId,
        driveGigsFolderId: gigs_.id,
        drivePhotosFolderId: photos.id,
      })
      .where(eq(bands.id, bandId));
    // A fresh link starts from the current end of the changes feed.
    const [cursor] = await this.db
      .select()
      .from(driveSyncCursors)
      .where(eq(driveSyncCursors.bandId, bandId));
    if (!cursor || !before?.root) {
      const pageToken = await this.drive.getStartPageToken(token);
      await this.db
        .insert(driveSyncCursors)
        .values({ bandId, pageToken })
        .onConflictDoUpdate({
          target: driveSyncCursors.bandId,
          set: { pageToken },
        });
    }
    return this.status(bandId);
  }

  async loadGig(bandId: string, gigId: string) {
    const [gig] = await this.db
      .select()
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

  /** Returns the gig's Drive folder id, creating `YYYY-MM-DD title` on first use. */
  ensureGigFolder(ctx: DriveContext, gigId: string): Promise<string> {
    const pending = this.gigLocks.get(gigId);
    if (pending) return pending;
    const run = this.createGigFolder(ctx, gigId).finally(() =>
      this.gigLocks.delete(gigId),
    );
    this.gigLocks.set(gigId, run);
    return run;
  }

  private async createGigFolder(
    ctx: DriveContext,
    gigId: string,
  ): Promise<string> {
    const gig = await this.loadGig(ctx.bandId, gigId);
    if (gig.driveFolderId) return gig.driveFolderId;
    const folder = await this.drive.createFolder(ctx.token, {
      name: `${gig.date} ${gig.title}`.trim(),
      parentId: ctx.gigsFolderId,
    });
    const [won] = await this.db
      .update(gigs)
      .set({ driveFolderId: folder.id })
      .where(and(eq(gigs.id, gigId), isNull(gigs.driveFolderId)))
      .returning({ id: gigs.id });
    if (won) return folder.id;
    // Another process won the race; drop ours and use theirs.
    await this.drive.trash(ctx.token, folder.id);
    return (await this.loadGig(ctx.bandId, gigId)).driveFolderId!;
  }
}
