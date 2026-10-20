import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { SongsModule } from "../songs/songs.module.js";
import {
  GigSetlistController,
  SetlistsController,
} from "./setlists.controller.js";
import { SetlistsService } from "./setlists.service.js";

@Module({
  imports: [BandsModule, SongsModule],
  controllers: [SetlistsController, GigSetlistController],
  providers: [SetlistsService],
  exports: [SetlistsService],
})
export class SetlistsModule {}
