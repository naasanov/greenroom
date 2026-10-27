import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  gigs,
  mediaFolders,
  mediaItems,
  songs,
  type Database,
} from "@greenroom/db";
import {
  MEDIA_ERROR_CODES,
  type GigMedia,
  type MediaCounts,
  type MediaFolder,
  type MediaItem,
  type SongMediaGroup,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import type { DriveDownloadResult } from "../integrations/index.js";
import {
  DriveStructureService,
  type DriveContext,
} from "./drive-structure.service.js";
import {
  driveFolderUrl,
  mediaCategory,
  toItemDto,
  type MediaItemRow,
} from "./media-util.js";

type FolderRow = typeof mediaFolders.$inferSelect;

const visible = and(isNull(mediaItems.deletedAt), isNull(mediaItems.trashedAt));
const toFolder = (f: FolderRow): MediaFolder => ({
  id: f.id,
  name: f.name,
  position: f.position,
});

@Injectable()
export class MediaService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly structure: DriveStructureService,
  ) {}

  private get drive() {
    return this.structure.drive;
  }

  async gigMedia(bandId: string, gigId: string): Promise<GigMedia> {
    const gig = await this.structure.loadGig(bandId, gigId);
    const status = await this.structure.status(bandId);
    const empty: GigMedia = {
      driveLinked: false,
      driveFolderUrl: null,
      folders: [],
      unsorted: [],
      counts: { photos: 0, videos: 0, other: 0 },
    };
    if (!status.folderSet) return empty;
    const [folders, items] = await Promise.all([
      this.db
        .select()
        .from(mediaFolders)
        .where(eq(mediaFolders.gigId, gigId))
        .orderBy(asc(mediaFolders.position), asc(mediaFolders.createdAt)),
      this.db
        .select()
        .from(mediaItems)
        .where(and(eq(mediaItems.gigId, gigId), visible))
        .orderBy(asc(mediaItems.createdAt), asc(mediaItems.id)),
    ]);
    const counts: MediaCounts = { photos: 0, videos: 0, other: 0 };
    for (const i of items) if (!i.missing) counts[mediaCategory(i.mimeType)]++;
    return {
      driveLinked: true,
      driveFolderUrl: gig.driveFolderId
        ? driveFolderUrl(gig.driveFolderId)
        : null,
      folders: folders.map((f) => ({
        ...toFolder(f),
        items: items.filter((i) => i.folderId === f.id).map(toItemDto),
      })),
      unsorted: items.filter((i) => i.folderId === null).map(toItemDto),
      counts,
    };
  }

  // ---- folders ----

  async createFolder(
    bandId: string,
    gigId: string,
    name: string,
  ): Promise<MediaFolder> {
    const ctx = await this.structure.requireContext(bandId);
    const gigFolderId = await this.structure.ensureGigFolder(ctx, gigId);
    const created = await this.drive.createFolder(ctx.token, {
      name,
      parentId: gigFolderId,
    });
    const [{ next }] = await this.db
      .select({
        next: sql<number>`coalesce(max(${mediaFolders.position}), -1) + 1`,
      })
      .from(mediaFolders)
      .where(eq(mediaFolders.gigId, gigId));
    // The poller may have inserted the row first; the unique drive id keeps one.
    const [row] = await this.db
      .insert(mediaFolders)
      .values({
        bandId,
        gigId,
        name,
        driveFolderId: created.id,
        position: Number(next),
      })
      .onConflictDoUpdate({
        target: mediaFolders.driveFolderId,
        set: { name },
      })
      .returning();
    return toFolder(row!);
  }

  private async getFolder(
    bandId: string,
    folderId: string,
  ): Promise<FolderRow> {
    const [f] = await this.db
      .select()
      .from(mediaFolders)
      .where(
        and(eq(mediaFolders.id, folderId), eq(mediaFolders.bandId, bandId)),
      );
    if (!f) throw new NotFoundException("Folder not found");
    return f;
  }

  async renameFolder(
    bandId: string,
    folderId: string,
    name: string,
  ): Promise<MediaFolder> {
    const folder = await this.getFolder(bandId, folderId);
    const ctx = await this.structure.requireContext(bandId);
    if (folder.driveFolderId)
      await this.drive.rename(ctx.token, folder.driveFolderId, name);
    const [row] = await this.db
      .update(mediaFolders)
      .set({ name })
      .where(eq(mediaFolders.id, folderId))
      .returning();
    return toFolder(row!);
  }

  async reorderFolders(
    bandId: string,
    gigId: string,
    ids: string[],
  ): Promise<MediaFolder[]> {
    await this.structure.loadGig(bandId, gigId);
    const existing = await this.db
      .select()
      .from(mediaFolders)
      .where(eq(mediaFolders.gigId, gigId))
      .orderBy(asc(mediaFolders.position), asc(mediaFolders.createdAt));
    const known = new Set(existing.map((f) => f.id));
    if (ids.some((id) => !known.has(id)) || new Set(ids).size !== ids.length) {
      throw new UnprocessableEntityException("ids must be this gig's folders");
    }
    const order = [
      ...ids,
      ...existing.map((f) => f.id).filter((id) => !ids.includes(id)),
    ];
    await this.db.transaction(async (tx) => {
      for (const [position, id] of order.entries())
        await tx
          .update(mediaFolders)
          .set({ position })
          .where(eq(mediaFolders.id, id));
    });
    const byId = new Map(existing.map((f) => [f.id, f]));
    return order.map((id, position) =>
      toFolder({ ...byId.get(id)!, position }),
    );
  }

  async deleteFolder(bandId: string, folderId: string): Promise<void> {
    const folder = await this.getFolder(bandId, folderId);
    const ctx = await this.structure.requireContext(bandId);
    const [{ n }] = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(mediaItems)
      .where(and(eq(mediaItems.folderId, folderId), visible));
    if (Number(n) > 0) {
      throw new ConflictException({
        code: MEDIA_ERROR_CODES.folderNotEmpty,
        message: "Folder is not empty",
      });
    }
    if (folder.driveFolderId)
      await this.drive.trash(ctx.token, folder.driveFolderId);
    await this.db.delete(mediaFolders).where(eq(mediaFolders.id, folderId));
  }

  // ---- items ----

  private async getItem(bandId: string, itemId: string): Promise<MediaItemRow> {
    const [row] = await this.db
      .select()
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.id, itemId),
          eq(mediaItems.bandId, bandId),
          isNull(mediaItems.deletedAt),
        ),
      );
    if (!row) throw new NotFoundException("Media item not found");
    return row;
  }

  private async getItems(
    bandId: string,
    ids: string[],
  ): Promise<MediaItemRow[]> {
    const unique = [...new Set(ids)];
    const rows = await this.db
      .select()
      .from(mediaItems)
      .where(
        and(
          inArray(mediaItems.id, unique),
          eq(mediaItems.bandId, bandId),
          isNull(mediaItems.deletedAt),
        ),
      );
    if (rows.length !== unique.length)
      throw new NotFoundException("Media item not found");
    return rows;
  }

  async markMissing(itemId: string): Promise<void> {
    await this.db
      .update(mediaItems)
      .set({ missing: true })
      .where(eq(mediaItems.id, itemId));
  }

  /** Runs a Drive call for an item; not-found marks it missing and reports false. */
  private async driveOp(
    item: MediaItemRow,
    op: () => Promise<{ status: "ok" | "not-found" }>,
  ): Promise<boolean> {
    if (item.missing) return false;
    const res = await op();
    if (res.status === "not-found") {
      await this.markMissing(item.id);
      return false;
    }
    return true;
  }

  async renameItem(
    bandId: string,
    itemId: string,
    name: string,
  ): Promise<MediaItem> {
    const item = await this.getItem(bandId, itemId);
    const ctx = await this.structure.requireContext(bandId);
    const ok = await this.driveOp(item, () =>
      this.drive.rename(ctx.token, item.driveFileId, name),
    );
    if (!ok) throw new NotFoundException("File is no longer in Drive");
    const [row] = await this.db
      .update(mediaItems)
      .set({ name, nameCustomized: true })
      .where(eq(mediaItems.id, itemId))
      .returning();
    return toItemDto(row!);
  }

  async moveItems(
    bandId: string,
    itemIds: string[],
    folderId: string | null,
  ): Promise<MediaItem[]> {
    const items = await this.getItems(bandId, itemIds);
    const gigId = items[0]!.gigId;
    if (items.some((i) => i.gigId !== gigId))
      throw new UnprocessableEntityException("Items must belong to one gig");
    const ctx = await this.structure.requireContext(bandId);
    let parent: string;
    if (folderId) {
      const folder = await this.getFolder(bandId, folderId);
      if (folder.gigId !== gigId || !folder.driveFolderId)
        throw new UnprocessableEntityException("Folder belongs to another gig");
      parent = folder.driveFolderId;
    } else {
      parent = await this.structure.ensureGigFolder(ctx, gigId);
    }
    for (const item of items) {
      await this.driveOp(item, () =>
        this.drive.move(ctx.token, item.driveFileId, parent),
      );
    }
    const rows = await this.db
      .update(mediaItems)
      .set({ folderId })
      .where(
        inArray(
          mediaItems.id,
          items.map((i) => i.id),
        ),
      )
      .returning();
    return rows.sort(byCreated).map(toItemDto);
  }

  async trashItems(bandId: string, itemIds: string[]): Promise<number> {
    const items = await this.getItems(bandId, itemIds);
    const ctx = await this.structure.requireContext(bandId);
    for (const item of items) {
      await this.driveOp(item, () =>
        this.drive.trash(ctx.token, item.driveFileId),
      );
    }
    await this.db
      .update(mediaItems)
      .set({ trashedAt: new Date() })
      .where(
        inArray(
          mediaItems.id,
          items.map((i) => i.id),
        ),
      );
    return items.length;
  }

  // ---- song links ----

  async linkSong(
    bandId: string,
    itemIds: string[],
    songId: string | null,
  ): Promise<MediaItem[]> {
    const items = await this.getItems(bandId, itemIds);
    let title: string | null = null;
    if (songId) {
      const [song] = await this.db
        .select({ title: songs.title })
        .from(songs)
        .where(and(eq(songs.id, songId), eq(songs.bandId, bandId)));
      if (!song) throw new UnprocessableEntityException("Song not found");
      title = song.title;
    }
    const ctx = title ? await this.structure.requireContext(bandId) : null;
    const out: MediaItemRow[] = [];
    for (const item of items) {
      let name = item.name;
      if (title && ctx && !item.nameCustomized && !item.missing) {
        const wanted = await this.uniqueName(
          ctx,
          item,
          `${title}${extensionOf(item.name)}`,
        );
        if (wanted !== item.name) {
          const ok = await this.driveOp(item, () =>
            this.drive.rename(ctx.token, item.driveFileId, wanted),
          );
          if (ok) name = wanted;
        }
      }
      const [row] = await this.db
        .update(mediaItems)
        .set({ songId, name })
        .where(eq(mediaItems.id, item.id))
        .returning();
      out.push(row!);
    }
    return out.sort(byCreated).map(toItemDto);
  }

  /** Appends " (2)", " (3)"... until no sibling in the same folder has the name. */
  private async uniqueName(
    _ctx: DriveContext,
    item: MediaItemRow,
    wanted: string,
  ): Promise<string> {
    const siblings = await this.db
      .select({ id: mediaItems.id, name: mediaItems.name })
      .from(mediaItems)
      .where(
        and(
          eq(mediaItems.gigId, item.gigId),
          item.folderId
            ? eq(mediaItems.folderId, item.folderId)
            : isNull(mediaItems.folderId),
          visible,
        ),
      );
    const taken = new Set(
      siblings.filter((s) => s.id !== item.id).map((s) => s.name),
    );
    if (!taken.has(wanted)) return wanted;
    const ext = extensionOf(wanted);
    const stem = wanted.slice(0, wanted.length - ext.length);
    for (let n = 2; ; n++) {
      const candidate = `${stem} (${n})${ext}`;
      if (!taken.has(candidate)) return candidate;
    }
  }

  async songMedia(bandId: string, songId: string): Promise<SongMediaGroup[]> {
    const rows = await this.db
      .select({ item: mediaItems, gig: gigs })
      .from(mediaItems)
      .innerJoin(gigs, eq(gigs.id, mediaItems.gigId))
      .where(
        and(
          eq(mediaItems.bandId, bandId),
          eq(mediaItems.songId, songId),
          visible,
          isNull(gigs.deletedAt),
        ),
      )
      .orderBy(desc(gigs.date), asc(mediaItems.createdAt), asc(mediaItems.id));
    const groups = new Map<string, SongMediaGroup>();
    for (const { item, gig } of rows) {
      let g = groups.get(gig.id);
      if (!g) {
        g = {
          gig: { id: gig.id, title: gig.title, date: gig.date },
          items: [],
        };
        groups.set(gig.id, g);
      }
      g.items.push(toItemDto(item));
    }
    return [...groups.values()];
  }

  // ---- streaming ----

  /** Resolves an item and the Drive credentials needed to stream it. */
  async openItem(
    bandId: string,
    itemId: string,
    kind: "thumbnail" | "content",
  ): Promise<{ item: MediaItemRow; result: OkDownload }> {
    const item = await this.getItem(bandId, itemId);
    if (item.missing || item.trashedAt)
      throw new NotFoundException("File is no longer in Drive");
    const ctx = await this.structure.requireContext(bandId);
    const result =
      kind === "thumbnail"
        ? await this.drive.getThumbnail(ctx.token, item.driveFileId)
        : await this.drive.download(ctx.token, item.driveFileId);
    if (result.status === "not-found") {
      const file = await this.drive.getFile(ctx.token, item.driveFileId);
      if (file.status === "not-found") await this.markMissing(item.id);
      else if (file.file.trashed)
        await this.db
          .update(mediaItems)
          .set({ trashedAt: new Date() })
          .where(eq(mediaItems.id, item.id));
      throw new NotFoundException("File is no longer in Drive");
    }
    return { item, result };
  }
}

type OkDownload = Extract<DriveDownloadResult, { status: "ok" }>;

const byCreated = (a: MediaItemRow, b: MediaItemRow): number =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

function extensionOf(name: string): string {
  const m = /\.[A-Za-z0-9]{1,8}$/.exec(name);
  return m ? m[0] : "";
}
