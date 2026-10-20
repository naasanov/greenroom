import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { createDb } from "@greenroom/db";
import { DRIZZLE } from "./db.constants.js";

type DbHandle = ReturnType<typeof createDb>;
const HANDLE = Symbol("DB_HANDLE");

@Global()
@Module({
  providers: [
    {
      provide: HANDLE,
      useFactory: (): DbHandle => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is not set");
        return createDb(url);
      },
    },
    { provide: DRIZZLE, useFactory: (h: DbHandle) => h.db, inject: [HANDLE] },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(HANDLE) private readonly handle: DbHandle) {}

  async onApplicationShutdown() {
    await this.handle.close();
  }
}
