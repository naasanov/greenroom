import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  CHORD_ERROR_CODES,
  chordsBandTransposeSchema,
  chordsBulkSchema,
  chordsSaveSchema,
  chordsSuggestSchema,
  isUltimateGuitarUrl,
  type ChordsIndex,
  type ChordsSuggestion,
  type SongChordSheet,
} from "@greenroom/shared";
import {
  BandMember,
  CurrentMembership,
  type BandMembership,
} from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ChordsService } from "./chords.service.js";

type SuggestBody = ReturnType<typeof chordsSuggestSchema.parse>;
type BulkBody = ReturnType<typeof chordsBulkSchema.parse>;
type SaveBody = ReturnType<typeof chordsSaveSchema.parse>;
type TransposeBody = ReturnType<typeof chordsBandTransposeSchema.parse>;

@BandMember()
@Controller("bands/:bandId/chords")
export class ChordsController {
  constructor(private readonly chords: ChordsService) {}

  @Get()
  index(@CurrentMembership() m: BandMembership): Promise<ChordsIndex> {
    return this.chords.index(m.bandId);
  }

  @Post("suggest")
  @HttpCode(200)
  suggest(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(chordsSuggestSchema)) body: SuggestBody,
  ): Promise<ChordsSuggestion> {
    return this.chords.suggest(m.bandId, body.title, body.artist ?? null);
  }

  @Post("sheets")
  @HttpCode(200)
  async sheets(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(chordsBulkSchema)) body: BulkBody,
  ): Promise<{ sheets: SongChordSheet[] }> {
    return { sheets: await this.chords.sheets(m.bandId, body.songIds) };
  }

  @Get("songs/:songId")
  get(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
  ): Promise<SongChordSheet> {
    return this.chords.get(m.bandId, songId);
  }

  @Post("songs/:songId/import")
  @HttpCode(200)
  importSheet(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
    @Body() body: { url?: unknown },
  ): Promise<SongChordSheet> {
    // Checked here (not by the Zod pipe) so the error carries the UG_INVALID_LINK code.
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!isUltimateGuitarUrl(url)) {
      throw new BadRequestException({
        code: CHORD_ERROR_CODES.invalidLink,
        message: "That is not an Ultimate Guitar link",
      });
    }
    return this.chords.importSheet(m.bandId, songId, url);
  }

  @Put("songs/:songId")
  save(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
    @Body(new ZodPipe(chordsSaveSchema)) body: SaveBody,
  ): Promise<SongChordSheet> {
    return this.chords.save(m.bandId, songId, body.text);
  }

  @Put("songs/:songId/band-transpose")
  setBandTranspose(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
    @Body(new ZodPipe(chordsBandTransposeSchema)) body: TransposeBody,
  ): Promise<SongChordSheet> {
    return this.chords.setBandTranspose(m.bandId, songId, body.semitones);
  }

  @Delete("songs/:songId")
  @HttpCode(204)
  async remove(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
  ): Promise<void> {
    await this.chords.remove(m.bandId, songId);
  }
}
