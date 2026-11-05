import { Module } from "@nestjs/common";
import { BandsModule } from "../bands/bands.module.js";
import { MediaModule } from "../media/media.module.js";
import { AccountController } from "./account.controller.js";
import { AccountService } from "./account.service.js";

// DRIZZLE, the integration adapters, and the calendar sync queue are global.
@Module({
  imports: [BandsModule, MediaModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
