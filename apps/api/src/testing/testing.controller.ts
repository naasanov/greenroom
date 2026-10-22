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
import type { User } from "@greenroom/shared";
import {
  SCENARIOS,
  isScenario,
  resetDatabase,
  seedScenario,
  type Database,
  type SeedResult,
} from "@greenroom/db";
import { Public } from "../auth/decorators.js";
import { AuthService } from "../auth/auth.service.js";
import { SessionService } from "../auth/session.service.js";
import { sessionCookieName } from "../auth/auth.constants.js";
import { DRIZZLE } from "../db/db.constants.js";
import {
  FakeIntegrationsRegistry,
  type SentMagicLink,
} from "../integrations/index.js";

// To add a control: inject nothing new, read/mutate the fake on `this.registry`,
// and return plain JSON. Mirror it in apps/e2e/src/test-api.ts.
@Public()
@Controller("__test__")
export class TestingController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly registry: FakeIntegrationsRegistry,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
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

  /** Creates the user if needed plus a session, and returns the raw cookie. */
  @Post("login")
  @HttpCode(200)
  async login(@Body() body: { email?: unknown }): Promise<{
    user: User;
    cookie: { name: string; value: string };
  }> {
    if (typeof body?.email !== "string" || !body.email.includes("@")) {
      throw new BadRequestException("email is required");
    }
    const { user } = await this.auth.findOrCreateByEmail(
      body.email.trim().toLowerCase(),
    );
    const value = await this.sessions.create(user.id);
    return { user, cookie: { name: sessionCookieName(), value } };
  }

  /** Makes every issued Spotify refresh token fail with invalid-grant. */
  @Post("spotify/revoke-refresh-tokens")
  @HttpCode(200)
  revokeSpotifyRefreshTokens(): { ok: true } {
    this.registry.spotify.revokeRefreshTokens();
    return { ok: true };
  }
}
