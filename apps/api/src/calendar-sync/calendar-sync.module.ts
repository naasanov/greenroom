import { Global, Module } from "@nestjs/common";
import { GoogleConnectModule } from "../google-connect/google-connect.module.js";
import { SyncContextService } from "./calendar-sync.context.js";
import { CalendarSyncController } from "./calendar-sync.controller.js";
import { CalendarPullService } from "./calendar-sync.pull.js";
import { CalendarPushService } from "./calendar-sync.push.js";
import { CalendarSyncQueue } from "./calendar-sync.queue.js";
import { CalendarSyncService } from "./calendar-sync.service.js";
import { CalendarSyncWorker } from "./calendar-sync.worker.js";

// Global so the events, bands and auth services can enqueue pushes without importing this module.
@Global()
@Module({
  imports: [GoogleConnectModule],
  controllers: [CalendarSyncController],
  providers: [
    CalendarSyncQueue,
    SyncContextService,
    CalendarPullService,
    CalendarPushService,
    CalendarSyncService,
    CalendarSyncWorker,
  ],
  exports: [CalendarSyncQueue, CalendarSyncService],
})
export class CalendarSyncModule {}
