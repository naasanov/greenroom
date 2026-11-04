import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { driveFileSongLinks, gigs, songs, type Database } from "@greenroom/db";
import {
  FILES_ERROR_CODES,
  FILES_LISTING_CAP,
  type FileEntry,
  type FileGig,
  type FileSongLink,
  type FilesFolderListing,
  type SetFileSongsResult,
  type SongFile,
} from "@greenroom/shared";
import { DRIZZLE } from "../db/db.constants.js";
import {
  DRIVE_FOLDER_MIME,
  type DriveByteRange,
  type DriveFile,
} from "../integrations/index.js";
import {
  DriveStructureService,
  type DriveContext,
  type DriveLookupMemo,
} from "../media/drive-structure.service.js";
import type { OkDownload } from "../media/media-util.js";

const isFolder = (f: { mimeType: string }) => f.mimeType === DRIVE_FOLDER_MIME;
const byFolderThenName = (a: DriveFile, b: DriveFile): number =>
  Number(isFolder(b)) - Number(isFolder(a)) ||
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) ||
  a.name.localeCompare(b.name);

const notFound = () => new NotFoundException("File not found");

/** Drive-style browsing and management of the band's Files root. */
@Injectable()
export class FilesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly structure: DriveStructureService,
  ) {}

  private get drive() {
    return this.structure.drive;
  }

  /** The file plus its path up to the Files root; 404 unless it lives under the root. */
  private async resolve(
    ctx: DriveContext,
    fileId: string,
    memo: DriveLookupMemo,
  ): Promise<{ file: DriveFile; chain: DriveFile[] }> {
    const id = fileId === "root" ? ctx.rootFolderId : fileId;
    const chain = await this.structure.ancestry(
      ctx.token,
      id,
      ctx.rootFolderId,
      memo,
    );
    if (!chain) throw notFound();
    return { file: chain[0]!, chain };
  }

  private async resolveFolder(
    ctx: DriveContext,
    folderId: string,
    memo: DriveLookupMemo,
  ) {
    const r = await this.resolve(ctx, folderId, memo);
    if (!isFolder(r.file)) throw notFound();
    return r;
  }

  // ---- browse ----

  async list(
    bandId: string,
    folderId: string | undefined,
  ): Promise<FilesFolderListing> {
    const ctx = await this.structure.requireContext(bandId);
    const memo: DriveLookupMemo = new Map();
    const { file, chain } = await this.resolveFolder(
      ctx,
      folderId ?? "root",
      memo,
    );
    const children = (await this.drive.listChildren(ctx.token, file.id)).sort(
      byFolderThenName,
    );
    const truncated = children.length > FILES_LISTING_CAP;
    const shown = children.slice(0, FILES_LISTING_CAP);
    const ids = shown.map((c) => c.id);
    const [gigByFolder, linksByFile] = await Promise.all([
      this.gigsByFolder(bandId, ids),
      this.linksByFile(bandId, ids),
    ]);
    const items: FileEntry[] = shown.map((c) => ({
      id: c.id,
      name: c.name,
      kind: isFolder(c) ? "folder" : "file",
      mimeType: isFolder(c) ? null : c.mimeType,
      sizeBytes: isFolder(c) ? null : c.size,
      modifiedTime: c.modifiedTime,
      thumbnailAvailable: c.thumbnailLink !== null,
      isGigsRoot: c.id === ctx.gigsFolderId,
      gig: gigByFolder.get(c.id) ?? null,
      songLinks: linksByFile.get(c.id) ?? [],
    }));
    return {
      folder: {
        id: file.id,
        name: file.name,
        isRoot: file.id === ctx.rootFolderId,
        isGigsRoot: file.id === ctx.gigsFolderId,
      },
      breadcrumbs: [...chain].reverse().map((c) => ({
        id: c.id,
        name: c.name,
        ...(c.id === ctx.gigsFolderId ? { isGigsRoot: true } : {}),
      })),
      items,
      truncated,
    };
  }

  private async gigsByFolder(
    bandId: string,
    driveIds: string[],
  ): Promise<Map<string, FileGig>> {
    const out = new Map<string, FileGig>();
    if (!driveIds.length) return out;
    const rows = await this.db
      .select({
        folder: gigs.driveFolderId,
        id: gigs.id,
        title: gigs.title,
        date: gigs.date,
      })
      .from(gigs)
      .where(
        and(
          eq(gigs.bandId, bandId),
          isNull(gigs.deletedAt),
          inArray(gigs.driveFolderId, driveIds),
        ),
      );
    for (const r of rows)
      out.set(r.folder!, { id: r.id, title: r.title, date: r.date });
    return out;
  }

  private async linksByFile(
    bandId: string,
    driveIds: string[],
  ): Promise<Map<string, FileSongLink[]>> {
    const out = new Map<string, FileSongLink[]>();
    if (!driveIds.length) return out;
    const rows = await this.db
      .select({
        file: driveFileSongLinks.driveFileId,
        songId: songs.id,
        title: songs.title,
      })
      .from(driveFileSongLinks)
      .innerJoin(songs, eq(songs.id, driveFileSongLinks.songId))
      .where(
        and(
          eq(driveFileSongLinks.bandId, bandId),
          inArray(driveFileSongLinks.driveFileId, driveIds),
          isNull(songs.deletedAt),
        ),
      )
      .orderBy(asc(songs.title), asc(songs.id));
    for (const r of rows) {
      const list = out.get(r.file) ?? [];
      list.push({ songId: r.songId, title: r.title });
      out.set(r.file, list);
    }
    return out;
  }

  // ---- mutations ----

  async createFolder(
    bandId: string,
    parentId: string,
    name: string,
  ): Promise<FileEntry> {
    const ctx = await this.structure.requireContext(bandId);
    const { file: parent } = await this.resolveFolder(ctx, parentId, new Map());
    const created = await this.drive.createFolder(ctx.token, {
      name,
      parentId: parent.id,
    });
    return {
      id: created.id,
      name: created.name,
      kind: "folder",
      mimeType: null,
      sizeBytes: null,
      modifiedTime: created.modifiedTime,
      thumbnailAvailable: false,
      isGigsRoot: false,
      gig: null,
      songLinks: [],
    };
  }

  async rename(bandId: string, fileId: string, name: string): Promise<void> {
    const ctx = await this.structure.requireContext(bandId);
    const { file } = await this.resolve(ctx, fileId, new Map());
    if (file.id === ctx.rootFolderId) {
      throw new ConflictException({
        code: FILES_ERROR_CODES.rootProtected,
        message: "The Files root cannot be renamed here",
      });
    }
    const res = await this.drive.rename(ctx.token, file.id, name);
    if (res.status === "not-found") throw notFound();
    await this.db
      .update(driveFileSongLinks)
      .set({ name })
      .where(
        and(
          eq(driveFileSongLinks.bandId, bandId),
          eq(driveFileSongLinks.driveFileId, file.id),
        ),
      );
  }

  /** Trashes files and plain folders; gig folders, the gigs root, and anything holding them are protected. */
  async trash(bandId: string, ids: string[]): Promise<{ trashed: number }> {
    const ctx = await this.structure.requireContext(bandId);
    const memo: DriveLookupMemo = new Map();
    const unique = [...new Set(ids)];
    const files = await Promise.all(
      unique.map(async (id) => (await this.resolve(ctx, id, memo)).file),
    );
    const protectedIds = await this.protectedFolderIds(ctx);
    const blocked = (id: string) =>
      id === ctx.rootFolderId || protectedIds.has(id);
    if (files.some((f) => blocked(f.id))) throw this.gigFolderProtected();
    // A plain folder that contains a protected folder cannot go either.
    if (files.some(isFolder)) {
      const targets = new Set(files.filter(isFolder).map((f) => f.id));
      for (const pid of protectedIds) {
        const chain = await this.structure.ancestry(
          ctx.token,
          pid,
          ctx.rootFolderId,
          memo,
        );
        if (chain?.some((c) => targets.has(c.id)))
          throw this.gigFolderProtected();
      }
    }
    for (const f of files) await this.drive.trash(ctx.token, f.id);
    return { trashed: files.length };
  }

  private gigFolderProtected() {
    return new ConflictException({
      code: FILES_ERROR_CODES.gigFolderProtected,
      message: "Gig folders and the gigs root cannot be trashed here",
    });
  }

  /** Drive ids of the gigs root and every non-deleted gig's folder. */
  private async protectedFolderIds(ctx: DriveContext): Promise<Set<string>> {
    const rows = await this.db
      .select({ folder: gigs.driveFolderId })
      .from(gigs)
      .where(and(eq(gigs.bandId, ctx.bandId), isNull(gigs.deletedAt)));
    const out = new Set<string>([ctx.gigsFolderId]);
    for (const r of rows) if (r.folder) out.add(r.folder);
    return out;
  }

  // ---- streaming ----

  /** Resolves a file under the root and opens its thumbnail or content from Drive. */
  async open(
    bandId: string,
    fileId: string,
    kind: "thumbnail" | "content",
    range?: DriveByteRange,
  ): Promise<{ file: DriveFile; result: OkDownload }> {
    const ctx = await this.structure.requireContext(bandId);
    const { file } = await this.resolve(ctx, fileId, new Map());
    if (isFolder(file)) throw notFound();
    const result =
      kind === "thumbnail"
        ? await this.drive.getThumbnail(ctx.token, file.id)
        : await this.drive.download(ctx.token, file.id, range);
    if (result.status === "not-found") throw notFound();
    return { file, result };
  }

  /** Metadata for range checks before streaming. */
  async stat(bandId: string, fileId: string): Promise<DriveFile> {
    const ctx = await this.structure.requireContext(bandId);
    const { file } = await this.resolve(ctx, fileId, new Map());
    if (isFolder(file)) throw notFound();
    return file;
  }

  // ---- song links ----

  async setSongs(
    bandId: string,
    fileId: string,
    songIds: string[],
  ): Promise<SetFileSongsResult> {
    const ctx = await this.structure.requireContext(bandId);
    const { file } = await this.resolve(ctx, fileId, new Map());
    const unique = [...new Set(songIds)];
    const found = unique.length
      ? await this.db
          .select({ id: songs.id, title: songs.title })
          .from(songs)
          .where(
            and(
              eq(songs.bandId, bandId),
              isNull(songs.deletedAt),
              inArray(songs.id, unique),
            ),
          )
      : [];
    if (found.length !== unique.length)
      throw new UnprocessableEntityException("Song not found");
    await this.db.transaction(async (tx) => {
      const mine = and(
        eq(driveFileSongLinks.bandId, bandId),
        eq(driveFileSongLinks.driveFileId, file.id),
      );
      await tx
        .delete(driveFileSongLinks)
        .where(
          unique.length
            ? and(mine, notInArray(driveFileSongLinks.songId, unique))
            : mine,
        );
      if (unique.length)
        await tx
          .insert(driveFileSongLinks)
          .values(
            unique.map((songId) => ({
              bandId,
              songId,
              driveFileId: file.id,
              name: file.name,
              mimeType: isFolder(file) ? null : file.mimeType,
              isFolder: isFolder(file),
            })),
          )
          .onConflictDoUpdate({
            target: [
              driveFileSongLinks.bandId,
              driveFileSongLinks.songId,
              driveFileSongLinks.driveFileId,
            ],
            set: {
              name: file.name,
              mimeType: isFolder(file) ? null : file.mimeType,
              isFolder: isFolder(file),
            },
          });
    });
    const links = (await this.linksByFile(bandId, [file.id])).get(file.id);
    return { songLinks: links ?? [] };
  }

  /** Removes one song link by Drive id, with no Drive call, so unavailable files unlink too. */
  async unlinkSongFile(
    bandId: string,
    songId: string,
    fileId: string,
  ): Promise<void> {
    const [song] = await this.db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.bandId, bandId)));
    if (!song) throw new NotFoundException("Song not found");
    const removed = await this.db
      .delete(driveFileSongLinks)
      .where(
        and(
          eq(driveFileSongLinks.bandId, bandId),
          eq(driveFileSongLinks.songId, songId),
          eq(driveFileSongLinks.driveFileId, fileId),
        ),
      )
      .returning({ id: driveFileSongLinks.id });
    if (removed.length === 0) throw new NotFoundException("Link not found");
  }

  /** Linked files for a song; unavailable ones stay listed with `available: false`. */
  async songFiles(bandId: string, songId: string): Promise<SongFile[]> {
    const [song] = await this.db
      .select({ id: songs.id })
      .from(songs)
      .where(
        and(
          eq(songs.id, songId),
          eq(songs.bandId, bandId),
          isNull(songs.deletedAt),
        ),
      );
    if (!song) throw new NotFoundException("Song not found");
    const links = await this.db
      .select()
      .from(driveFileSongLinks)
      .where(
        and(
          eq(driveFileSongLinks.bandId, bandId),
          eq(driveFileSongLinks.songId, songId),
        ),
      )
      .orderBy(asc(driveFileSongLinks.createdAt), asc(driveFileSongLinks.id));
    const ctx = await this.structure.context(bandId);
    const memo: DriveLookupMemo = new Map();
    const live = new Map<string, DriveFile | null>();
    if (ctx) {
      await Promise.all(
        links.map(async (l) => {
          const chain = await this.structure.ancestry(
            ctx.token,
            l.driveFileId,
            ctx.rootFolderId,
            memo,
          );
          live.set(l.driveFileId, chain?.[0] ?? null);
        }),
      );
    }
    const gigByFolder = await this.gigsByFolder(
      bandId,
      links.filter((l) => l.isFolder).map((l) => l.driveFileId),
    );
    const out: SongFile[] = [];
    for (const l of links) {
      const f = live.get(l.driveFileId) ?? null;
      if (
        f &&
        (f.name !== l.name || (!isFolder(f) && f.mimeType !== l.mimeType))
      )
        await this.db
          .update(driveFileSongLinks)
          .set({ name: f.name, mimeType: isFolder(f) ? null : f.mimeType })
          .where(eq(driveFileSongLinks.id, l.id));
      out.push({
        id: l.id,
        driveFileId: l.driveFileId,
        name: f?.name ?? l.name,
        mimeType: f ? (isFolder(f) ? null : f.mimeType) : l.mimeType,
        isFolder: l.isFolder,
        available: !!f,
        sizeBytes: f && !isFolder(f) ? f.size : null,
        modifiedTime: f?.modifiedTime ?? null,
        thumbnailAvailable: !!f && f.thumbnailLink !== null,
        parentId: f?.parentId ?? null,
        gig: gigByFolder.get(l.driveFileId) ?? null,
      });
    }
    return out;
  }
}
