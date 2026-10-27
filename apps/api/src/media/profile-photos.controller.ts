import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import {
  MAX_BAND_PHOTO_BYTES,
  type BandPhoto,
  type MemberPhoto,
  type User,
} from "@greenroom/shared";
import { CurrentUser, Public } from "../auth/decorators.js";
import { BandAdmin, BandMember } from "../bands/index.js";
import { sendStream } from "./media-util.js";
import {
  ProfilePhotosService,
  type PhotoStream,
  type UploadedImage,
} from "./profile-photos.service.js";

const upload = () =>
  FileInterceptor("photo", { limits: { fileSize: MAX_BAND_PHOTO_BYTES } });

function send(res: Response, p: PhotoStream, cache: string): void {
  sendStream(res, p.result.stream, {
    "Content-Type": p.mimeType,
    "Content-Length": p.result.size,
    "Cache-Control": cache,
    "Cross-Origin-Resource-Policy": "cross-origin",
  });
}

@Controller("bands/:bandId")
export class ProfilePhotosController {
  constructor(private readonly photos: ProfilePhotosService) {}

  @BandAdmin()
  @Put("photo")
  @UseInterceptors(upload())
  async setBandPhoto(
    @Param("bandId") bandId: string,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<BandPhoto> {
    return { photoUrl: await this.photos.setBandPhoto(bandId, file) };
  }

  @BandAdmin()
  @Delete("photo")
  @HttpCode(204)
  clearBandPhoto(@Param("bandId") bandId: string): Promise<void> {
    return this.photos.clearBandPhoto(bandId);
  }

  // Public: the band photo appears on the public gig calendar.
  @Public()
  @Get("photo")
  async bandPhoto(
    @Param("bandId") bandId: string,
    @Res() res: Response,
  ): Promise<void> {
    send(
      res,
      await this.photos.openBandPhoto(bandId),
      "public, max-age=31536000, immutable",
    );
  }

  @BandMember()
  @Put("members/me/photo")
  @UseInterceptors(upload())
  async setMyPhoto(
    @Param("bandId") bandId: string,
    @CurrentUser() user: User,
    @UploadedFile() file: UploadedImage | undefined,
  ): Promise<MemberPhoto> {
    return {
      photoUrl: await this.photos.setMemberPhoto(bandId, user.id, file),
    };
  }

  @BandMember()
  @Delete("members/me/photo")
  @HttpCode(204)
  clearMyPhoto(
    @Param("bandId") bandId: string,
    @CurrentUser() user: User,
  ): Promise<void> {
    return this.photos.clearMemberPhoto(bandId, user.id);
  }

  @BandMember()
  @Get("members/:userId/photo")
  async memberPhoto(
    @Param("bandId") bandId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ): Promise<void> {
    const target = userId === "me" ? user.id : userId;
    send(
      res,
      await this.photos.openMemberPhoto(bandId, target),
      "private, max-age=3600",
    );
  }
}
