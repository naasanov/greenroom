import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { JobsService } from "../jobs/jobs.service.js";
import { testingEnabled } from "../testing/testing.enabled.js";
import { PUSH_QUEUE, type PushJob } from "./calendar-sync.queue.js";
import { CalendarSyncService } from "./calendar-sync.service.js";

export const PULL_QUEUE = "calendar-pull";
const PULL_CRON = "* * * * *";

/** Registers the push queue and the every-minute pull; both stay off while fakes drive tests. */
@Injectable()
export class CalendarSyncWorker implements OnModuleInit {
  private readonly log = new Logger(CalendarSyncWorker.name);

  constructor(
    private readonly jobs: JobsService,
    private readonly sync: CalendarSyncService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (testingEnabled()) return;
    await this.jobs.register<PushJob>(
      PUSH_QUEUE,
      (data) => this.sync.runJob(data),
      {
        queue: {
          policy: "short",
          retryLimit: 5,
          retryDelay: 15,
          retryBackoff: true,
        },
      },
    );
    await this.jobs.register(PULL_QUEUE, () => this.sync.syncAll(), {
      queue: { retryLimit: 0 },
    });
    const boss = await this.jobs.start();
    await boss.schedule(PULL_QUEUE, PULL_CRON);
    this.log.log(`Calendar sync scheduled (${PULL_CRON})`);
  }
}
