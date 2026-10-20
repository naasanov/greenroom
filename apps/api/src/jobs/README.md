# Jobs

`JobsModule` is global. It starts one pg-boss instance against `DATABASE_URL` on app boot and stops it on shutdown (needs `app.enableShutdownHooks()` for signal-driven stops). pg-boss keeps its tables in its own `pgboss` schema, so Drizzle migrations and the `/__test__/reset` truncate (public schema only) are unaffected.

## Register a job

```ts
@Injectable()
export class SyncService implements OnModuleInit {
  constructor(private readonly jobs: JobsService) {}

  async onModuleInit() {
    // Creates the queue (idempotent) and starts a worker. Handler gets the job data.
    await this.jobs.register<{ bandId: string }, { synced: number }>(
      "calendar-sync",
      async (data, job) => ({ synced: 0 }),
      { queue: { retryLimit: 0 } },
    );
  }

  enqueue(bandId: string) {
    return this.jobs.send("calendar-sync", { bandId });
  }
}
```

- The handler's return value is stored as the job output (`getJob(queue, id)` returns it with `state`).
- One job runs at a time per worker. Pass `options.work` (pg-boss `WorkOptions`) to change polling or concurrency.
- Throwing fails the job; set `retryLimit` on the queue if it is safe to retry.
- Recurring jobs: call `(await jobs.start()).schedule(name, cron)` after registering.
- Progress for in-flight jobs is not persisted by pg-boss. Keep it in memory or the database yourself (see `songs/imports.service.ts`).
