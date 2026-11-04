import {
  Body,
  Controller,
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
  createFilesFolderSchema,
  linkGigFolderSchema,
  renameFileSchema,
  setFileSongsSchema,
  trashFilesSchema,
  type CreateFilesFolder,
  type FileEntry,
  type FilesFolderListing,
  type GigMedia,
  type LinkGigFolder,
  type RenameFile,
  type SetFileSongs,
  type SetFileSongsResult,
  type SongFile,
  type TrashFiles,
} from "@greenroom/shared";
import { BandMember } from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import {
  parseRange,
  sendContent,
  sendThumbnail,
  sendUnsatisfiable,
} from "../media/media-util.js";
import { FilesService } from "./files.service.js";
import { GigFolderLinkService } from "./gig-folder-link.service.js";

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@BandMember()
@Controller("bands/:bandId")
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly gigLink: GigFolderLinkService,
  ) {}

  @Get(["files/folder", "files/folder/:folderId"])
  list(
    @Param("bandId") bandId: string,
    @Param("folderId") folderId?: string,
  ): Promise<FilesFolderListing> {
    return this.files.list(bandId, folderId);
  }

  @Post("files/folders")
  createFolder(
    @Param("bandId") bandId: string,
    @Body(new ZodPipe(createFilesFolderSchema)) body: CreateFilesFolder,
  ): Promise<FileEntry> {
    return this.files.createFolder(bandId, body.parentId, body.name);
  }

  @Post("files/items/trash")
  @HttpCode(200)
  trash(
    @Param("bandId") bandId: string,
    @Body(new ZodPipe(trashFilesSchema)) body: TrashFiles,
  ): Promise<{ trashed: number }> {
    return this.files.trash(bandId, body.ids);
  }

  @Patch("files/items/:fileId")
  async rename(
    @Param("bandId") bandId: string,
    @Param("fileId") fileId: string,
    @Body(new ZodPipe(renameFileSchema)) body: RenameFile,
  ): Promise<{ id: string; name: string }> {
    await this.files.rename(bandId, fileId, body.name);
    return { id: fileId, name: body.name };
  }

  @Get("files/items/:fileId/thumbnail")
  async thumbnail(
    @Param("bandId") bandId: string,
    @Param("fileId") fileId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { result } = await this.files.open(bandId, fileId, "thumbnail");
    await sendThumbnail(res, result);
  }

  @Get("files/items/:fileId/content")
  async content(
    @Param("bandId") bandId: string,
    @Param("fileId") fileId: string,
    @Query("download") download: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const stat = await this.files.stat(bandId, fileId);
    const parsed = parseRange(req.headers.range, stat.size);
    if (parsed === "unsatisfiable") {
      sendUnsatisfiable(res, stat.size);
      return;
    }
    const { file, result } = await this.files.open(
      bandId,
      fileId,
      "content",
      parsed ?? undefined,
    );
    sendContent(res, result, {
      mimeType: file.mimeType,
      name: file.name,
      download: download === "1",
    });
  }

  @Put("files/items/:fileId/songs")
  setSongs(
    @Param("bandId") bandId: string,
    @Param("fileId") fileId: string,
    @Body(new ZodPipe(setFileSongsSchema)) body: SetFileSongs,
  ): Promise<SetFileSongsResult> {
    return this.files.setSongs(bandId, fileId, body.songIds);
  }

  @Get("songs/:songId/files")
  songFiles(
    @Param("bandId") bandId: string,
    @Param("songId", uuid()) songId: string,
  ): Promise<SongFile[]> {
    return this.files.songFiles(bandId, songId);
  }

  @Post("gigs/:gigId/media/link-folder")
  @HttpCode(200)
  linkFolder(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
    @Body(new ZodPipe(linkGigFolderSchema)) body: LinkGigFolder,
  ): Promise<GigMedia> {
    return this.gigLink.link(bandId, gigId, body.folderId);
  }
}
