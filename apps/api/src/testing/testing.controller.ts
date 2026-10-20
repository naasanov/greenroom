import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Get,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import {
  SCENARIOS,
  isScenario,
  resetDatabase,
  seedScenario,
  type Database,
  type SeedResult,
} from "@greenroom/db";
import { DRIZZLE } from "../db/db.constants.js";
import {
  FakeIntegrationsRegistry,
  type SentMagicLink,
} from "../integrations/index.js";

// To add a control: inject nothing new, read/mutate the fake on `this.registry`,
// and return plain JSON. Mirror it in apps/e2e/src/test-api.ts.
@Controller("__test__")
export class TestingController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly registry: FakeIntegrationsRegistry,
  ) {}

  @Post("reset")
  @HttpCode(200)
  async reset(): Promise<{ ok: true }> {
    await resetDatabase(this.db);
    this.registry.resetAll();
    return { ok: true };
  }

  @Post("seed")
  @HttpCode(200)
  async seed(@Body() body: { scenario?: unknown }): Promise<SeedResult> {
    if (!isScenario(body?.scenario)) {
      throw new BadRequestException(
        `scenario must be one of: ${SCENARIOS.join(", ")}`,
      );
    }
    this.registry.resetAll();
    return seedScenario(this.db, body.scenario);
  }

  @Get("email/magic-links")
  magicLinks(@Query("to") to?: string): { links: SentMagicLink[] } {
    const all = this.registry.email.sentMagicLinks();
    return { links: to ? all.filter((l) => l.to === to) : all };
  }
}
