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
} from "@nestjs/common";
import {
  createAudioMarkerSchema,
  updateAudioMarkerSchema,
  type AudioMarker,
  type CreateAudioMarker,
  type UpdateAudioMarker,
} from "@greenroom/shared";
import {
  BandMember,
  CurrentMembership,
  type BandMembership,
} from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { AudioMarkersService } from "./audio-markers.service.js";

const markerId = () => new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@BandMember()
@Controller("bands/:bandId")
export class AudioMarkersController {
  constructor(private readonly markers: AudioMarkersService) {}

  @Get("files/items/:fileId/markers")
  list(
    @CurrentMembership() m: BandMembership,
    @Param("fileId") fileId: string,
  ): Promise<AudioMarker[]> {
    return this.markers.list(m.bandId, fileId);
  }

  @Post("files/items/:fileId/markers")
  create(
    @CurrentMembership() m: BandMembership,
    @Param("fileId") fileId: string,
    @Body(new ZodPipe(createAudioMarkerSchema)) body: CreateAudioMarker,
  ): Promise<AudioMarker> {
    return this.markers.create(m.bandId, m.userId, fileId, body);
  }

  @Patch("audio-markers/:markerId")
  update(
    @CurrentMembership() m: BandMembership,
    @Param("markerId", markerId()) id: string,
    @Body(new ZodPipe(updateAudioMarkerSchema)) body: UpdateAudioMarker,
  ): Promise<AudioMarker> {
    return this.markers.update(m.bandId, id, body);
  }

  @Delete("audio-markers/:markerId")
  @HttpCode(204)
  async remove(
    @CurrentMembership() m: BandMembership,
    @Param("markerId", markerId()) id: string,
  ): Promise<void> {
    await this.markers.remove(m.bandId, id);
  }
}
