import { Injectable, type OnModuleInit } from "@nestjs/common";
import { JobsService } from "../jobs/jobs.service.js";
import { testingEnabled } from "../testing/testing.enabled.js";
import { INVITE_QUEUE, type InviteJob } from "./calendar-invite.queue.js";
import { CalendarInviteService } from "./calendar-invite.service.js";

/** Registers the invite queue; it stays off while fakes drive tests. */
@Injectable()
export class CalendarInviteWorker implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly invites: CalendarInviteService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (testingEnabled()) return;
    await this.jobs.register<InviteJob>(
      INVITE_QUEUE,
      (data) => this.invites.runJob(data),
      {
        queue: {
          policy: "short",
          retryLimit: 5,
          retryDelay: 30,
          retryBackoff: true,
        },
      },
    );
  }
}
