import { Global, Module } from "@nestjs/common";
import { CalendarInviteQueue } from "./calendar-invite.queue.js";
import { CalendarInviteService } from "./calendar-invite.service.js";
import { CalendarInviteWorker } from "./calendar-invite.worker.js";

// Global so the events, bands, account and auth services can enqueue without importing this module.
@Global()
@Module({
  providers: [CalendarInviteQueue, CalendarInviteService, CalendarInviteWorker],
  exports: [CalendarInviteQueue, CalendarInviteService],
})
export class CalendarInviteModule {}
