import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import {
  createMediaFolderSchema,
  linkMediaSongSchema,
  moveMediaItemsSchema,
  renameSchema,
  reorderMediaFoldersSchema,
  trashMediaItemsSchema,
  type CreateMediaFolder,
  type GigMedia,
  type LinkMediaSong,
  type MediaFolder,
  type MediaItem,
  type MoveMediaItems,
  type RenameMedia,
  type ReorderMediaFolders,
  type SongMediaGroup,
  type TrashMediaItems,
} from "@greenroom/shared";
import { BandMember } from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { MediaService } from "./media.service.js";
import {
  contentDisposition,
  inlineSafe,
  readAll,
  sendStream,
  sniffImageMime,
} from "./media-util.js";
import { Readable } from "node:stream";

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const PRIVATE_CACHE = "private, max-age=60";

@BandMember()
@Controller("bands/:bandId")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get("gigs/:gigId/media")
  gigMedia(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
  ): Promise<GigMedia> {
    return this.media.gigMedia(bandId, gigId);
  }

  @Post("gigs/:gigId/media/folders")
  createFolder(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
    @Body(new ZodPipe(createMediaFolderSchema)) body: CreateMediaFolder,
  ): Promise<MediaFolder> {
    return this.media.createFolder(bandId, gigId, body.name);
  }

  @Put("gigs/:gigId/media/folders/order")
  reorderFolders(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
    @Body(new ZodPipe(reorderMediaFoldersSchema)) body: ReorderMediaFolders,
  ): Promise<MediaFolder[]> {
    return this.media.reorderFolders(bandId, gigId, body.ids);
  }

  @Patch("media/folders/:folderId")
  renameFolder(
    @Param("bandId") bandId: string,
    @Param("folderId", uuid()) folderId: string,
    @Body(new ZodPipe(renameSchema)) body: RenameMedia,
  ): Promise<MediaFolder> {
    return this.media.renameFolder(bandId, folderId, body.name);
  }

  @Delete("media/folders/:folderId")
  @HttpCode(204)
  deleteFolder(
    @Param("bandId") bandId: string,
    @Param("folderId", uuid()) folderId: string,
  ): Promise<void> {
    return this.media.deleteFolder(bandId, folderId);
  }

  @Post("media/move")
  @HttpCode(200)
  move(
    @Param("bandId") bandId: string,
    @Body(new ZodPipe(moveMediaItemsSchema)) body: MoveMediaItems,
  ): Promise<MediaItem[]> {
    return this.media.moveItems(bandId, body.itemIds, body.folderId);
  }

  @Post("media/trash")
  @HttpCode(200)
  async trash(
    @Param("bandId") bandId: string,
    @Body(new ZodPipe(trashMediaItemsSchema)) body: TrashMediaItems,
  ): Promise<{ trashed: number }> {
    return { trashed: await this.media.trashItems(bandId, body.itemIds) };
  }

  @Put("media/items/song")
  linkSong(
    @Param("bandId") bandId: string,
    @Body(new ZodPipe(linkMediaSongSchema)) body: LinkMediaSong,
  ): Promise<MediaItem[]> {
    return this.media.linkSong(bandId, body.itemIds, body.songId);
  }

  @Get("songs/:songId/media")
  songMedia(
    @Param("bandId") bandId: string,
    @Param("songId", uuid()) songId: string,
  ): Promise<SongMediaGroup[]> {
    return this.media.songMedia(bandId, songId);
  }

  @Patch("media/:itemId")
  renameItem(
    @Param("bandId") bandId: string,
    @Param("itemId", uuid()) itemId: string,
    @Body(new ZodPipe(renameSchema)) body: RenameMedia,
  ): Promise<MediaItem> {
    return this.media.renameItem(bandId, itemId, body.name);
  }

  @Get("media/:itemId/thumbnail")
  async thumbnail(
    @Param("bandId") bandId: string,
    @Param("itemId", uuid()) itemId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { result } = await this.media.openItem(bandId, itemId, "thumbnail");
    const buf = await readAll(result.stream);
    sendStream(res, Readable.from([buf]), {
      "Content-Type": sniffImageMime(buf),
      "Content-Length": buf.length,
      "Cache-Control": PRIVATE_CACHE,
    });
  }

  @Get("media/:itemId/content")
  async content(
    @Param("bandId") bandId: string,
    @Param("itemId", uuid()) itemId: string,
    @Query("download") download: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { item, result } = await this.media.openItem(
      bandId,
      itemId,
      "content",
    );
    const mime = item.mimeType ?? "application/octet-stream";
    const attachment = download === "1" || !inlineSafe(mime);
    sendStream(res, result.stream, {
      "Content-Type": mime,
      "Content-Length": result.size,
      "Content-Disposition": contentDisposition(
        attachment ? "attachment" : "inline",
        item.name,
      ),
      "Cache-Control": PRIVATE_CACHE,
    });
  }
}
