import { Controller, Get, Param, Query } from "@nestjs/common";
import type { GigLink, PracticeLink, SongLink, User } from "@greenroom/shared";
import { CurrentUser } from "../auth/decorators.js";
import { LinksService } from "./links.service.js";

@Controller("links")
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Get("gigs/:gigId")
  gig(
    @CurrentUser() user: User,
    @Param("gigId") gigId: string,
  ): Promise<GigLink> {
    return this.links.gig(user.id, gigId);
  }

  @Get("songs/:songId")
  song(
    @CurrentUser() user: User,
    @Param("songId") songId: string,
  ): Promise<SongLink> {
    return this.links.song(user.id, songId);
  }

  @Get("practices/:seriesId")
  practice(
    @CurrentUser() user: User,
    @Param("seriesId") seriesId: string,
    @Query("date") date: unknown,
  ): Promise<PracticeLink> {
    return this.links.practice(user.id, seriesId, date);
  }
}
