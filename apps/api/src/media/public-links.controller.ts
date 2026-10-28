import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import {
  createPublicUploadSchema,
  createUploadLinkSchema,
  type CreatePublicUpload,
  type CreateUploadLink,
  type PublicUploadLinkInfo,
  type PublicUploadSession,
  type UploadLink,
  type User,
} from "@greenroom/shared";
import { CurrentUser, Public } from "../auth/decorators.js";
import { BandMember } from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { PublicLinksService } from "./public-links.service.js";
import { MAX_CHUNK_REQUEST_BYTES, readBody } from "./uploads.controller.js";

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@BandMember()
@Controller("bands/:bandId")
export class UploadLinksController {
  constructor(private readonly links: PublicLinksService) {}

  @Post("gigs/:gigId/upload-links")
  @HttpCode(200)
  create(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
    @CurrentUser() user: User,
    @Query("new") fresh: string | undefined,
    @Body(new ZodPipe(createUploadLinkSchema)) body: CreateUploadLink,
  ): Promise<UploadLink> {
    return this.links.create(
      bandId,
      gigId,
      user.id,
      body.expiresInDaysAfterGig,
      fresh === "1" || fresh === "true",
    );
  }

  @Get("gigs/:gigId/upload-links")
  list(
    @Param("bandId") bandId: string,
    @Param("gigId", uuid()) gigId: string,
  ): Promise<UploadLink[]> {
    return this.links.list(bandId, gigId);
  }

  @Delete("upload-links/:linkId")
  revoke(
    @Param("bandId") bandId: string,
    @Param("linkId", uuid()) linkId: string,
  ): Promise<UploadLink> {
    return this.links.revoke(bandId, linkId);
  }
}

/** Anonymous endpoints; the token in the path is the only credential. */
@Public()
@UseGuards(ThrottlerGuard)
@Controller("public/upload-links/:token")
export class PublicUploadLinksController {
  constructor(private readonly links: PublicLinksService) {}

  @SkipThrottle({ link: true, ip: true })
  @Get()
  info(@Param("token") token: string): Promise<PublicUploadLinkInfo> {
    return this.links.info(token);
  }

  @Post("uploads")
  @HttpCode(200)
  create(
    @Param("token") token: string,
    @Body(new ZodPipe(createPublicUploadSchema)) body: CreatePublicUpload,
  ): Promise<PublicUploadSession> {
    return this.links.createUpload(token, body);
  }

  @SkipThrottle({ link: true, ip: true })
  @Put("uploads/:sessionId")
  chunk(
    @Param("token") token: string,
    @Param("sessionId", uuid()) sessionId: string,
    @Req() req: Request,
  ): Promise<PublicUploadSession> {
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
      String(req.headers["content-range"] ?? "").trim(),
    );
    if (!m) throw new BadRequestException("Invalid Content-Range header");
    const range = {
      start: Number(m[1]),
      end: Number(m[2]),
      total: Number(m[3]),
    };
    return readBody(req, MAX_CHUNK_REQUEST_BYTES).then((data) =>
      this.links.chunk(token, sessionId, range, data),
    );
  }

  @SkipThrottle({ link: true, ip: true })
  @Delete("uploads/:sessionId")
  cancel(
    @Param("token") token: string,
    @Param("sessionId", uuid()) sessionId: string,
  ): Promise<PublicUploadSession> {
    return this.links.cancel(token, sessionId);
  }
}
