import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  addSongToSetlistSchema,
  appendSetlistSongSchema,
  copySetlistSchema,
  gigHistoryQuerySchema,
  replaceSetlistItemsSchema,
  type AddSongToSetlist,
  type AppendSetlistSong,
  type CopySetlist,
  type GigHistoryEntry,
  type GigHistoryQuery,
  type GigSetlist,
  type ReplaceSetlistItems,
  type SetlistDetail,
  type SongAddedToSetlist,
} from "@greenroom/shared";
import {
  BandMember,
  CurrentMembership,
  type BandMembership,
} from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { SetlistsService } from "./setlists.service.js";

// Every member can do everything here; nothing in the design is admin-only.
@BandMember()
@Controller("bands/:bandId/setlists")
export class SetlistsController {
  constructor(private readonly setlists: SetlistsService) {}

  // Declared before `:setlistId` so "history" is not read as an id.
  @Get("history")
  history(
    @CurrentMembership() m: BandMembership,
    @Query(new ZodPipe(gigHistoryQuerySchema)) query: GigHistoryQuery,
  ): Promise<GigHistoryEntry[]> {
    return this.setlists.gigHistory(m.bandId, query);
  }

  @Get(":setlistId")
  get(
    @CurrentMembership() m: BandMembership,
    @Param("setlistId") setlistId: string,
  ): Promise<SetlistDetail> {
    return this.setlists.get(m.bandId, setlistId);
  }

  @Put(":setlistId/items")
  replace(
    @CurrentMembership() m: BandMembership,
    @Param("setlistId") setlistId: string,
    @Body(new ZodPipe(replaceSetlistItemsSchema)) body: ReplaceSetlistItems,
  ): Promise<SetlistDetail> {
    return this.setlists.replace(m.bandId, setlistId, body.songIds);
  }

  @Post(":setlistId/items")
  @HttpCode(200)
  append(
    @CurrentMembership() m: BandMembership,
    @Param("setlistId") setlistId: string,
    @Body(new ZodPipe(appendSetlistSongSchema)) body: AppendSetlistSong,
  ): Promise<SetlistDetail> {
    return this.setlists.append(m.bandId, setlistId, body.songId);
  }

  @Delete(":setlistId/items/:songId")
  remove(
    @CurrentMembership() m: BandMembership,
    @Param("setlistId") setlistId: string,
    @Param("songId") songId: string,
  ): Promise<SetlistDetail> {
    return this.setlists.removeSong(m.bandId, setlistId, songId);
  }

  @Post(":setlistId/copy")
  @HttpCode(200)
  copy(
    @CurrentMembership() m: BandMembership,
    @Param("setlistId") setlistId: string,
    @Body(new ZodPipe(copySetlistSchema)) body: CopySetlist,
  ): Promise<SetlistDetail> {
    return this.setlists.copyFrom(m.bandId, setlistId, body);
  }

  @Post(":setlistId/songs")
  addNewSong(
    @CurrentMembership() m: BandMembership,
    @Param("setlistId") setlistId: string,
    @Body(new ZodPipe(addSongToSetlistSchema)) body: AddSongToSetlist,
  ): Promise<SongAddedToSetlist> {
    return this.setlists.addNewSong(m.bandId, setlistId, body);
  }
}

@BandMember()
@Controller("bands/:bandId/gigs/:gigId/setlist")
export class GigSetlistController {
  constructor(private readonly setlists: SetlistsService) {}

  /** Creates the gig's (empty) setlist on first access. */
  @Get()
  get(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
  ): Promise<GigSetlist> {
    return this.setlists.forGig(m.bandId, gigId);
  }
}
