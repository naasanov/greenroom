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
import { CalendarSyncQueue } from "../calendar-sync/calendar-sync.queue.js";
import { CalendarSyncService } from "../calendar-sync/calendar-sync.service.js";
import { DRIZZLE } from "../db/db.constants.js";
import {
  FakeIntegrationsRegistry,
  type AttendeeResponse,
  type CalendarEvent,
  type CalendarEventPatch,
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
    private readonly calendarSync: CalendarSyncService,
    private readonly calendarQueue: CalendarSyncQueue,
  ) {}

  @Post("reset")
  @HttpCode(200)
  async reset(): Promise<{ ok: true }> {
    await resetDatabase(this.db);
    this.registry.resetAll();
    this.calendarQueue.reset();
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
    this.calendarQueue.reset();
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

  /** Playlists the Spotify fake created through export, in creation order. */
  @Get("spotify/created-playlists")
  spotifyCreatedPlaylists(): {
    id: string;
    name: string;
    isPublic: boolean;
    trackIds: string[];
  }[] {
    return this.registry.spotify.createdPlaylists();
  }

  // ---- Google Calendar sync ----

  /** Applies every pending app-to-Google push now (one band, or all). */
  @Post("calendar/flush")
  @HttpCode(200)
  async calendarFlush(
    @Body() body: { bandId?: string },
  ): Promise<{ ok: true }> {
    await this.calendarSync.flush(body?.bandId);
    return { ok: true };
  }

  /** Runs one pull pass for the band (Google to app), then flushes pending pushes. */
  @Post("calendar/sync")
  @HttpCode(200)
  async calendarSyncPass(
    @Body() body: { bandId?: string },
  ): Promise<{ ok: true }> {
    if (!body?.bandId) throw new BadRequestException("bandId is required");
    await this.calendarSync.syncBand(body.bandId);
    return { ok: true };
  }

  /** Name and time zone a fake calendar was created with. */
  @Get("calendar/info")
  calendarInfo(
    @Query("calendarId") calendarId: string,
  ): { summary: string; timeZone: string } | null {
    return this.registry.googleCalendar.calendarInfo(calendarId) ?? null;
  }

  /** Every event stored in a fake calendar, cancelled ones included. */
  @Get("calendar/events")
  calendarEvents(@Query("calendarId") calendarId: string): CalendarEvent[] {
    return this.registry.googleCalendar.listEvents(calendarId);
  }

  @Post("calendar/simulate/edit")
  @HttpCode(200)
  calendarEdit(
    @Body()
    b: {
      calendarId: string;
      eventId: string;
      patch: CalendarEventPatch;
    },
  ): { ok: true } {
    this.registry.googleCalendar.simulateExternalEdit(
      b.calendarId,
      b.eventId,
      b.patch,
    );
    return { ok: true };
  }

  @Post("calendar/simulate/instance-edit")
  @HttpCode(200)
  calendarInstanceEdit(
    @Body()
    b: {
      calendarId: string;
      recurringEventId: string;
      originalStart: string;
      patch: CalendarEventPatch & { cancelled?: boolean };
    },
  ): { ok: true } {
    this.registry.googleCalendar.simulateInstanceEdit(
      b.calendarId,
      b.recurringEventId,
      b.originalStart,
      b.patch,
    );
    return { ok: true };
  }

  @Post("calendar/simulate/delete")
  @HttpCode(200)
  calendarDelete(@Body() b: { calendarId: string; eventId: string }): {
    ok: true;
  } {
    this.registry.googleCalendar.simulateExternalDelete(
      b.calendarId,
      b.eventId,
    );
    return { ok: true };
  }

  @Post("calendar/simulate/attendee-response")
  @HttpCode(200)
  calendarAttendeeResponse(
    @Body()
    b: {
      calendarId: string;
      eventId: string;
      email: string;
      responseStatus: AttendeeResponse;
    },
  ): { ok: true } {
    this.registry.googleCalendar.simulateAttendeeResponse(
      b.calendarId,
      b.eventId,
      b.email,
      b.responseStatus,
    );
    return { ok: true };
  }

  @Post("calendar/simulate/instance-attendee-response")
  @HttpCode(200)
  calendarInstanceAttendeeResponse(
    @Body()
    b: {
      calendarId: string;
      recurringEventId: string;
      originalStart: string;
      email: string;
      responseStatus: AttendeeResponse;
    },
  ): { ok: true } {
    this.registry.googleCalendar.simulateInstanceAttendeeResponse(
      b.calendarId,
      b.recurringEventId,
      b.originalStart,
      b.email,
      b.responseStatus,
    );
    return { ok: true };
  }

  /** Makes every sync token issued so far report as expired. */
  @Post("calendar/expire-sync-tokens")
  @HttpCode(200)
  calendarExpireTokens(@Body() b: { calendarId: string }): { ok: true } {
    this.registry.googleCalendar.expireSyncTokens(b.calendarId);
    return { ok: true };
  }
}
