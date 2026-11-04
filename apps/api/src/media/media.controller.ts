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
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
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
import { MediaZipService } from "./media-zip.service.js";
import {
  parseRange,
  sendContent,
  sendThumbnail,
  sendUnsatisfiable,
} from "./media-util.js";

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@BandMember()
@Controller("bands/:bandId")
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly zip: MediaZipService,
  ) {}

  @Get("media/zip")
  async zipItems(
    @Param("bandId") bandId: string,
    @Query("ids") ids: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.zip.stream(bandId, ids ?? "", res);
  }

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
    await sendThumbnail(res, result);
  }

  @Get("media/:itemId/content")
  async content(
    @Param("bandId") bandId: string,
    @Param("itemId", uuid()) itemId: string,
    @Query("download") download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const item0 = await this.media.getItemRow(bandId, itemId);
    const parsed = parseRange(req.headers.range, item0.sizeBytes);
    if (parsed === "unsatisfiable") {
      sendUnsatisfiable(res, item0.sizeBytes);
      return;
    }
    const { item, result } = await this.media.openItem(
      bandId,
      itemId,
      "content",
      parsed ?? undefined,
    );
    sendContent(res, result, {
      mimeType: item.mimeType,
      name: item.name,
      download: download === "1",
    });
  }
}
