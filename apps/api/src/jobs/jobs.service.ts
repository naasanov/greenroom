import {
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import {
  PgBoss,
  type Job,
  type JobWithMetadata,
  type Queue,
  type SendOptions,
  type WorkOptions,
} from "pg-boss";

export interface RegisterOptions {
  queue?: Omit<Queue, "name">;
  work?: WorkOptions;
}

/** Owns the single pg-boss instance. Other modules register queues and send jobs through it. */
@Injectable()
export class JobsService implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(JobsService.name);
  private starting: Promise<PgBoss> | null = null;

  /** Starts pg-boss once; every caller shares the same started instance. */
  start(): Promise<PgBoss> {
    this.starting ??= this.boot();
    return this.starting;
  }

  async onModuleInit(): Promise<void> {
    await this.start();
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.starting) return;
    const boss = await this.starting.catch(() => null);
    await boss?.stop({ graceful: true, timeout: 10_000 });
  }

  /** Creates the queue if needed and starts a worker that handles one job at a time. */
  async register<T extends object, R extends object | void = void>(
    queue: string,
    handler: (data: T, job: Job<T>) => Promise<R>,
    options: RegisterOptions = {},
  ): Promise<void> {
    const boss = await this.start();
    await boss.createQueue(queue, options.queue);
    await boss.work<T, R>(
      queue,
      { pollingIntervalSeconds: 0.5, ...options.work },
      async (jobs) => {
        const job = jobs[0]!;
        return handler(job.data, job);
      },
    );
  }

  async send<T extends object>(
    queue: string,
    data: T,
    options?: SendOptions,
  ): Promise<string> {
    const boss = await this.start();
    const id = await boss.send(queue, data, options);
    if (!id) throw new Error(`Job was not queued on ${queue}`);
    return id;
  }

  async getJob<T extends object>(
    queue: string,
    id: string,
  ): Promise<JobWithMetadata<T> | null> {
    const boss = await this.start();
    const [job] = await boss.findJobs<T>(queue, { id });
    return job ?? null;
  }

  private async boot(): Promise<PgBoss> {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const boss = new PgBoss({ connectionString: url, max: 4 });
    boss.on("error", (err: Error) => this.log.error(err.message, err.stack));
    await boss.start();
    return boss;
  }
}
