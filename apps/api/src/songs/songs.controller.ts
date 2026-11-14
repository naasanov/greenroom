import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  createSongSchema,
  exportLibrarySchema,
  importPlaylistSchema,
  listSongsQuerySchema,
  resolveSongSchema,
  suggestReferencesSchema,
  updateSongSchema,
  type CreateSong,
  type DeletedSong,
  type ExportLibrary,
  type ExportResult,
  type ImportPlaylist,
  type ImportProgress,
  type ListSongsQuery,
  type ReferenceTag,
  type ResolveResult,
  type ResolveSong,
  type SongCreated,
  type SongDetail,
  type SongSummary,
  type ReferenceSuggestion,
  type SuggestReferences,
  type UpdateSong,
  type User,
} from "@greenroom/shared";
import {
  BandMember,
  CurrentMembership,
  type BandMembership,
} from "../bands/index.js";
import { CurrentUser } from "../auth/decorators.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { ExportService } from "./export.service.js";
import { ImportsService } from "./imports.service.js";
import { ReferenceSuggestionsService } from "./reference-suggestions.service.js";
import { SmartAddService } from "./smart-add.service.js";
import { SongsService } from "./songs.service.js";

// Every member can do everything here; nothing in the design is admin-only.
@BandMember()
@Controller("bands/:bandId/songs")
export class SongsController {
  constructor(
    private readonly songs: SongsService,
    private readonly smartAdd: SmartAddService,
    private readonly imports: ImportsService,
    private readonly exporter: ExportService,
    private readonly suggestions: ReferenceSuggestionsService,
  ) {}

  @Get()
  list(
    @CurrentMembership() m: BandMembership,
    @Query(new ZodPipe(listSongsQuerySchema)) query: ListSongsQuery,
  ): Promise<SongSummary[]> {
    return this.songs.list(m.bandId, query);
  }

  @Get("reference-tags")
  referenceTags(
    @CurrentMembership() m: BandMembership,
  ): Promise<ReferenceTag[]> {
    return this.songs.referenceTags(m.bandId);
  }

  @Post()
  create(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(createSongSchema)) body: CreateSong,
  ): Promise<SongCreated> {
    return this.songs.create(m.bandId, body);
  }

  @Post("resolve")
  @HttpCode(200)
  resolve(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(resolveSongSchema)) body: ResolveSong,
  ): Promise<ResolveResult> {
    return this.smartAdd.resolve(m.bandId, body.input);
  }

  @Post("suggest-references")
  @HttpCode(200)
  async suggestReferences(
    @Body(new ZodPipe(suggestReferencesSchema)) body: SuggestReferences,
  ): Promise<{ suggestions: ReferenceSuggestion[] }> {
    return { suggestions: await this.suggestions.suggest(body) };
  }

  @Post("import")
  @HttpCode(202)
  startImport(
    @CurrentUser() user: User,
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(importPlaylistSchema)) body: ImportPlaylist,
  ): Promise<ImportProgress> {
    return this.imports.start(user.id, m.bandId, body.url);
  }

  // Declared before `:songId` routes; exports in the requested library sort.
  @Post("export")
  @HttpCode(200)
  async exportLibrary(
    @CurrentUser() user: User,
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(exportLibrarySchema)) body: ExportLibrary,
  ): Promise<ExportResult> {
    const list = await this.songs.list(m.bandId, { sort: body.sort });
    return this.exporter.exportSongs(user.id, body.name, list);
  }

  @Get("imports/:importId")
  importStatus(
    @CurrentMembership() m: BandMembership,
    @Param("importId") importId: string,
  ): Promise<ImportProgress> {
    return this.imports.status(m.bandId, importId);
  }

  @Get(":songId")
  get(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
  ): Promise<SongDetail> {
    return this.songs.get(m.bandId, songId);
  }

  @Patch(":songId")
  update(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
    @Body(new ZodPipe(updateSongSchema)) body: UpdateSong,
  ): Promise<SongDetail> {
    return this.songs.update(m.bandId, songId, body);
  }

  @Delete(":songId")
  remove(
    @CurrentMembership() m: BandMembership,
    @Param("songId") songId: string,
  ): Promise<DeletedSong> {
    return this.songs.remove(m.bandId, songId);
  }
}
