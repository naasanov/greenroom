import { Controller, Get, Inject, Logger } from "@nestjs/common";
import { healthResponseSchema, type HealthResponse } from "@greenroom/shared";
import { sql } from "drizzle-orm";
import type { Database } from "@greenroom/db";
import { Public } from "./auth/decorators.js";
import { DRIZZLE } from "./db/db.constants.js";

@Public()
@Controller("health")
export class HealthController {
  private readonly log = new Logger(HealthController.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    let database: "up" | "down" = "up";
    try {
      await this.db.execute(sql`select 1`);
    } catch (err) {
      this.log.error(
        `health check: database down: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      database = "down";
    }
    return healthResponseSchema.parse({
      status: "ok",
      version: "0.0.1",
      database,
    });
  }
}
