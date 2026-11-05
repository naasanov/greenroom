import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { bands, driveSyncCursors, gigs, type Database } from "@greenroom/db";
import {
  FILES_ERROR_CODES,
  MEDIA_ERROR_CODES,
  type DriveStatus,
  type SetGigsFolder,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import { GoogleLinksService } from "../google-connect/index.js";
import {
  DRIVE_FOLDER_MIME,
  DriveAncestryCache,
  GOOGLE_DRIVE,
  type DriveFile,
  type DriveFileResult,
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

/** Per-request cache of Drive lookups, keyed by file id. */
export type DriveLookupMemo = Map<string, Promise<DriveFileResult>>;

const MAX_ANCESTRY_DEPTH = 64;

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
    readonly ancestryCache: DriveAncestryCache,
  ) {}

  /** Null when Drive is unlinked, revoked, or no folder has been chosen. */
  async context(bandId: string): Promise<DriveContext | null> {
    const [[band], token] = await Promise.all([
      this.db.select().from(bands).where(eq(bands.id, bandId)),
      this.links.getAccessToken(bandId, "drive"),
    ]);
    if (
      !band?.driveRootFolderId ||
      !band.driveGigsFolderId ||
      !band.drivePhotosFolderId ||
      !token
    )
      return null;
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
  async setRootFolder(
    bandId: string,
    folderId: string,
    gigsFolderId?: string,
  ): Promise<DriveStatus> {
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
    let gigs_: { id: string };
    if (gigsFolderId) {
      await this.requireFolderInside(token, gigsFolderId, folderId);
      gigs_ = { id: gigsFolderId };
    } else {
      gigs_ =
        reuse("Gigs") ??
        (await this.drive.createFolder(token, {
          name: "Gigs",
          parentId: folderId,
        }));
    }
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

  /**
   * Chain of files from `fileId` up to and including `rootId` (node first), or
   * null when the file is missing, trashed, or not under the root.
   */
  async ancestry(
    token: string,
    fileId: string,
    rootId: string,
    memo: DriveLookupMemo = new Map(),
  ): Promise<DriveFile[] | null> {
    const cache = this.ancestryCache;
    const epoch = cache.epoch();
    const chain: DriveFile[] = [];
    let current: string | null = fileId;
    while (current && chain.length < MAX_ANCESTRY_DEPTH) {
      const id: string = current;
      const cached = cache.get(token, rootId, id);
      if (cached) {
        chain.push(...cached);
        this.rememberFolders(token, rootId, chain, epoch);
        return chain;
      }
      let pending = memo.get(id);
      if (!pending) {
        pending = this.drive
          .getFile(token, id)
          .catch(() => ({ status: "not-found" }) as DriveFileResult);
        memo.set(id, pending);
      }
      const found = await pending;
      if (found.status !== "ok" || found.file.trashed) return null;
      chain.push(found.file);
      if (id === rootId) {
        this.rememberFolders(token, rootId, chain, epoch);
        return chain;
      }
      current = found.file.parentId;
    }
    return null;
  }

  /** Caches each folder's own chain (node first) from a verified chain. */
  private rememberFolders(
    token: string,
    rootId: string,
    chain: DriveFile[],
    epoch: number,
  ): void {
    chain.forEach((f, i) => {
      if (f.mimeType === DRIVE_FOLDER_MIME)
        this.ancestryCache.set(token, rootId, chain.slice(i), epoch);
    });
  }

  /** Records listed child folders as verified descendants of `parentChain`'s root. */
  rememberChildren(
    token: string,
    rootId: string,
    parentChain: DriveFile[],
    children: DriveFile[],
    epoch: number,
  ): void {
    for (const c of children)
      if (c.mimeType === DRIVE_FOLDER_MIME && !c.trashed)
        this.ancestryCache.set(token, rootId, [c, ...parentChain], epoch);
  }

  /** Throws unless `folderId` is a live folder strictly inside `rootId`. */
  private async requireFolderInside(
    token: string,
    folderId: string,
    rootId: string,
  ): Promise<DriveFile> {
    const chain = await this.ancestry(token, folderId, rootId);
    if (!chain) {
      throw new UnprocessableEntityException({
        code: FILES_ERROR_CODES.outsideRoot,
        message: "The folder must be inside the Files root",
      });
    }
    const folder = chain[0]!;
    if (folder.mimeType !== DRIVE_FOLDER_MIME) {
      throw new UnprocessableEntityException({
        code: MEDIA_ERROR_CODES.notAFolder,
        message: "The chosen item is not a folder in Drive",
      });
    }
    if (folder.id === rootId) {
      throw new UnprocessableEntityException({
        code: FILES_ERROR_CODES.outsideRoot,
        message: "The folder must be inside the Files root, not the root",
      });
    }
    return folder;
  }

  /** Changes only where new gig folders are created; existing gig folders stay put. */
  async setGigsFolder(
    bandId: string,
    body: SetGigsFolder,
  ): Promise<DriveStatus> {
    const ctx = await this.requireContext(bandId);
    let folderId: string;
    if ("create" in body) {
      const created = await this.drive.createFolder(ctx.token, {
        name: body.name ?? "Gigs",
        parentId: ctx.rootFolderId,
      });
      folderId = created.id;
    } else {
      folderId = (
        await this.requireFolderInside(
          ctx.token,
          body.folderId,
          ctx.rootFolderId,
        )
      ).id;
    }
    await this.db
      .update(bands)
      .set({ driveGigsFolderId: folderId })
      .where(eq(bands.id, bandId));
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

  /** Returns the gig's Drive folder id, creating `YY-MM-DD title` on first use. */
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
      name: `${gig.date.slice(2)} ${gig.title}`.trim(),
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
