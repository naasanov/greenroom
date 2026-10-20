import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  createGigSchema,
  createPracticeSchema,
  deletePracticeQuerySchema,
  listEventsQuerySchema,
  placesQuerySchema,
  setPracticeSetlistSchema,
  setRsvpSchema,
  updateGigSchema,
  updatePracticeSchema,
  type CalendarEvent,
  type CreateGig,
  type CreatePractice,
  type DeletePracticeQuery,
  type Gig,
  type ListEventsQuery,
  type PlacesQuery,
  type PracticeEditResult,
  type PracticeOccurrence,
  type PracticeSeries,
  type PracticeSetlistResult,
  type SetPracticeSetlist,
  type SetRsvp,
  type UpdateGig,
  type UpdatePractice,
} from "@greenroom/shared";
import {
  BandMember,
  CurrentMembership,
  type BandMembership,
} from "../bands/index.js";
import { ZodPipe } from "../common/zod.pipe.js";
import type { PlaceDetails, PlacePrediction } from "../integrations/index.js";
import { EventsService } from "./events.service.js";
import { GigsService } from "./gigs.service.js";
import { PlacesService } from "./places.service.js";
import { PracticesService } from "./practices.service.js";

@Controller("bands/:bandId/gigs")
export class GigsController {
  constructor(private readonly gigs: GigsService) {}

  @BandMember()
  @Post()
  create(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(createGigSchema)) body: CreateGig,
  ): Promise<Gig> {
    return this.gigs.create(m.bandId, m.userId, body);
  }

  @BandMember()
  @Get(":gigId")
  get(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
  ): Promise<Gig> {
    return this.gigs.get(m.bandId, gigId);
  }

  @BandMember()
  @Patch(":gigId")
  update(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
    @Body(new ZodPipe(updateGigSchema)) body: UpdateGig,
  ): Promise<Gig> {
    return this.gigs.update(m.bandId, gigId, body);
  }

  @BandMember()
  @Delete(":gigId")
  @HttpCode(204)
  async remove(
    @CurrentMembership() m: BandMembership,
    @Param("gigId") gigId: string,
  ): Promise<void> {
    await this.gigs.remove(m.bandId, gigId);
  }
}

@Controller("bands/:bandId/practices")
export class PracticesController {
  constructor(private readonly practices: PracticesService) {}

  @BandMember()
  @Post()
  create(
    @CurrentMembership() m: BandMembership,
    @Body(new ZodPipe(createPracticeSchema)) body: CreatePractice,
  ): Promise<PracticeSeries> {
    return this.practices.create(m.bandId, m.userId, body);
  }

  @BandMember()
  @Get(":seriesId")
  series(
    @CurrentMembership() m: BandMembership,
    @Param("seriesId") seriesId: string,
  ): Promise<PracticeSeries> {
    return this.practices.getSeries(m.bandId, seriesId);
  }

  @BandMember()
  @Get(":seriesId/occurrences/:key")
  occurrence(
    @CurrentMembership() m: BandMembership,
    @Param("seriesId") seriesId: string,
    @Param("key") key: string,
  ): Promise<PracticeOccurrence> {
    return this.practices.getOccurrence(m.bandId, m.userId, seriesId, key);
  }

  @BandMember()
  @Patch(":seriesId/occurrences/:key")
  update(
    @CurrentMembership() m: BandMembership,
    @Param("seriesId") seriesId: string,
    @Param("key") key: string,
    @Body(new ZodPipe(updatePracticeSchema)) body: UpdatePractice,
  ): Promise<PracticeEditResult> {
    return this.practices.update(m.bandId, m.userId, seriesId, key, body);
  }

  @BandMember()
  @Delete(":seriesId/occurrences/:key")
  @HttpCode(204)
  async remove(
    @CurrentMembership() m: BandMembership,
    @Param("seriesId") seriesId: string,
    @Param("key") key: string,
    @Query(new ZodPipe(deletePracticeQuerySchema)) q: DeletePracticeQuery,
  ): Promise<void> {
    await this.practices.remove(m.bandId, seriesId, key, q.scope);
  }

  @BandMember()
  @Put(":seriesId/occurrences/:key/rsvp")
  rsvp(
    @CurrentMembership() m: BandMembership,
    @Param("seriesId") seriesId: string,
    @Param("key") key: string,
    @Body(new ZodPipe(setRsvpSchema)) body: SetRsvp,
  ): Promise<PracticeOccurrence> {
    return this.practices.setRsvp(
      m.bandId,
      m.userId,
      seriesId,
      key,
      body.status,
    );
  }

  @BandMember()
  @Put(":seriesId/occurrences/:key/setlist")
  setlist(
    @CurrentMembership() m: BandMembership,
    @Param("seriesId") seriesId: string,
    @Param("key") key: string,
    @Body(new ZodPipe(setPracticeSetlistSchema)) body: SetPracticeSetlist,
  ): Promise<PracticeSetlistResult> {
    return this.practices.setSetlist(m.bandId, seriesId, key, body);
  }
}

@Controller("bands/:bandId/events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @BandMember()
  @Get()
  list(
    @CurrentMembership() m: BandMembership,
    @Query(new ZodPipe(listEventsQuerySchema)) q: ListEventsQuery,
  ): Promise<CalendarEvent[]> {
    return this.events.list(m.bandId, q.from, q.to, q.type);
  }
}

@Controller("bands/:bandId/places")
@UseGuards(ThrottlerGuard)
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @BandMember()
  @Get("autocomplete")
  autocomplete(
    @Query(new ZodPipe(placesQuerySchema)) q: PlacesQuery,
  ): Promise<PlacePrediction[]> {
    return this.places.autocomplete(q.q);
  }

  @BandMember()
  @Get(":placeId")
  details(@Param("placeId") placeId: string): Promise<PlaceDetails> {
    return this.places.details(placeId);
  }
}
