import { Controller, Get, Inject } from "@nestjs/common";
import { healthResponseSchema, type HealthResponse } from "@greenroom/shared";
import { sql } from "drizzle-orm";
import type { Database } from "@greenroom/db";
import { Public } from "./auth/decorators.js";
import { DRIZZLE } from "./db/db.constants.js";

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    let database: "up" | "down" = "up";
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      database = "down";
    }
    return healthResponseSchema.parse({
      status: "ok",
      version: "0.0.1",
      database,
    });
  }
}
