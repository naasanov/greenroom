import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import {
  bulkPatchUploadsSchema,
  createUploadSchema,
  patchUploadSchema,
  type BulkPatchUploads,
  type CreateUpload,
  type PatchUpload,
  type UploadSession,
  type User,
} from "@greenroom/shared";
import { CurrentUser } from "../auth/decorators.js";
import { BandMember } from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { UploadsService } from "./uploads.service.js";

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 404 });
export const MAX_CHUNK_REQUEST_BYTES = 9 * 1024 * 1024;

@BandMember()
@Controller("bands/:bandId")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("gigs/:gigId/uploads")
  @HttpCode(200)
  create(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
    @CurrentUser() user: User,
    @Body(new ZodPipe(createUploadSchema)) body: CreateUpload,
  ): Promise<UploadSession> {
    return this.uploads.create({ bandId, gigId, userId: user.id }, body);
  }

  @Get("gigs/:gigId/uploads")
  list(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
    @CurrentUser() user: User,
  ): Promise<UploadSession[]> {
    // Only the caller's own sessions are ever listed.
    return this.uploads.listMine(bandId, gigId, user.id);
  }

  @Patch("uploads")
  bulkPatch(
    @Param("bandId") bandId: string,
    @CurrentUser() user: User,
    @Body(new ZodPipe(bulkPatchUploadsSchema)) body: BulkPatchUploads,
  ): Promise<UploadSession[]> {
    const { ids, ...patch } = body;
    return this.uploads.bulkPatch(bandId, { userId: user.id }, ids, patch);
  }

  @Get("uploads/:sessionId")
  get(
    @Param("bandId") bandId: string,
    @Param("sessionId", uuid()) sessionId: string,
    @CurrentUser() user: User,
  ): Promise<UploadSession> {
    return this.uploads.get(bandId, sessionId, { userId: user.id });
  }

  @Put("uploads/:sessionId")
  async chunk(
    @Param("bandId") bandId: string,
    @Param("sessionId", uuid()) sessionId: string,
    @CurrentUser() user: User,
    @Req() req: Request,
  ): Promise<UploadSession> {
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
      String(req.headers["content-range"] ?? "").trim(),
    );
    if (!m) throw new BadRequestException("Invalid Content-Range header");
    const range = {
      start: Number(m[1]),
      end: Number(m[2]),
      total: Number(m[3]),
    };
    const data = await readBody(req, MAX_CHUNK_REQUEST_BYTES);
    return this.uploads.chunk(
      bandId,
      sessionId,
      { userId: user.id },
      range,
      data,
    );
  }

  @Patch("uploads/:sessionId")
  patch(
    @Param("bandId") bandId: string,
    @Param("sessionId", uuid()) sessionId: string,
    @CurrentUser() user: User,
    @Body(new ZodPipe(patchUploadSchema)) body: PatchUpload,
  ): Promise<UploadSession> {
    return this.uploads.patch(bandId, sessionId, { userId: user.id }, body);
  }

  @Delete("uploads/:sessionId")
  cancel(
    @Param("bandId") bandId: string,
    @Param("sessionId", uuid()) sessionId: string,
    @CurrentUser() user: User,
  ): Promise<UploadSession> {
    return this.uploads.cancel(bandId, sessionId, { userId: user.id });
  }
}

/** Reads the raw request body, rejecting anything over `limit` bytes. */
export async function readBody(req: Request, limit: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > limit) throw new PayloadTooLargeException();
  const parts: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    const buf = Buffer.from(c as Buffer);
    size += buf.length;
    if (size > limit) throw new PayloadTooLargeException();
    parts.push(buf);
  }
  return Buffer.concat(parts);
}
