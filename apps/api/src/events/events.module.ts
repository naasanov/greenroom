import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import type { Request } from "express";
import { BandsModule } from "../bands/bands.module.js";
import {
  EventsController,
  GigsController,
  PlacesController,
  PracticesController,
} from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { GigsService } from "./gigs.service.js";
import { PlacesService } from "./places.service.js";
import { PracticesService } from "./practices.service.js";

// Places lookups are limited per signed-in user (they bill against the Places API).
const placesThrottle = {
  name: "places",
  ttl: 60_000,
  limit: 30,
  getTracker: (req: Record<string, unknown>) =>
    String((req as unknown as Request & { user?: { id: string } }).user?.id),
};

@Module({
  imports: [
    BandsModule,
    ThrottlerModule.forRoot({ throttlers: [placesThrottle] }),
  ],
  controllers: [
    GigsController,
    PracticesController,
    EventsController,
    PlacesController,
  ],
  providers: [GigsService, PracticesService, EventsService, PlacesService],
})
export class EventsModule {}
