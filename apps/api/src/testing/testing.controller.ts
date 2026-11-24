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
import { eq, sql } from "drizzle-orm";
import type { User } from "@greenroom/shared";
import {
  SCENARIOS,
  isScenario,
  resetDatabase,
  seedScenario,
  songLinkCache,
  type Database,
  type SeedResult,
} from "@greenroom/db";
import { Public } from "../auth/decorators.js";
import { AuthService } from "../auth/auth.service.js";
import { SessionService } from "../auth/session.service.js";
import { sessionCookieName } from "../auth/auth.constants.js";
import { CalendarInviteInboundService } from "../calendar-invites/calendar-invite-inbound.service.js";
import { CalendarInviteQueue } from "../calendar-invites/calendar-invite.queue.js";
import { CalendarInviteService } from "../calendar-invites/calendar-invite.service.js";
import { DRIZZLE } from "../db/db.constants.js";
import { normalizeSourceUrl } from "../songs/source-url.js";
import {
  DriveAncestryCache,
  FakeIntegrationsRegistry,
  type FakeIssue,
  type SentCalendarInvite,
  type SentMagicLink,
  SuggestionLookupState,
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
    private readonly driveCache: DriveAncestryCache,
    private readonly lookupState: SuggestionLookupState,
    private readonly invites: CalendarInviteService,
    private readonly inviteQueue: CalendarInviteQueue,
    private readonly inbound: CalendarInviteInboundService,
  ) {}

  @Post("reset")
  @HttpCode(200)
  async reset(): Promise<{ ok: true }> {
    await resetDatabase(this.db);
    this.registry.resetAll();
    this.driveCache.clear();
    this.lookupState.reset();
    this.inviteQueue.reset();
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
    this.driveCache.clear();
    this.lookupState.reset();
    this.inviteQueue.reset();
    return seedScenario(this.db, body.scenario);
  }

  @Get("email/magic-links")
  magicLinks(@Query("to") to?: string): { links: SentMagicLink[] } {
    const all = this.registry.email.sentMagicLinks();
    return { links: to ? all.filter((l) => l.to === to) : all };
  }

  /** Calendar invite emails the fake sent, oldest first; `clear=1` empties the log after reading. */
  @Get("email/calendar-invites")
  calendarInvites(
    @Query("to") to?: string,
    @Query("clear") clear?: string,
  ): { invites: SentCalendarInvite[] } {
    const all = this.registry.email.sentCalendarInvites();
    if (clear === "1") this.registry.email.clearCalendarInvites();
    return {
      invites: to
        ? all.filter((i) => i.to.toLowerCase() === to.toLowerCase())
        : all,
    };
  }

  /** Sends every pending calendar invite reconcile now (one band, or all). */
  @Post("calendar-invites/flush")
  @HttpCode(200)
  async calendarInvitesFlush(
    @Body() body: { bandId?: string },
  ): Promise<{ ok: true }> {
    await this.invites.flush(body?.bandId);
    return { ok: true };
  }

  /** Stores an inbound message that a signed webhook post can then fetch by id. */
  @Post("email/inbound")
  @HttpCode(200)
  addInbound(
    @Body()
    body: {
      emailId?: unknown;
      from?: unknown;
      recipients?: unknown;
      calendars?: unknown;
      authFailed?: unknown;
    },
  ): { ok: true } {
    if (
      typeof body?.emailId !== "string" ||
      typeof body.from !== "string" ||
      !Array.isArray(body.recipients) ||
      !Array.isArray(body.calendars)
    ) {
      throw new BadRequestException("emailId, from, recipients, calendars");
    }
    this.registry.email.addReceivedEmail(body.emailId, {
      from: body.from,
      recipients: body.recipients.map(String),
      calendars: body.calendars.map(String),
      authFailed: body.authFailed === true,
    });
    return { ok: true };
  }

  /** Runs a parsed inbound reply through the handler, skipping the webhook signature. */
  @Post("calendar-invites/reply")
  @HttpCode(200)
  async calendarInviteReply(
    @Body() body: { from?: unknown; to?: unknown; ics?: unknown },
  ): Promise<{ outcome: string }> {
    if (
      typeof body?.from !== "string" ||
      typeof body.to !== "string" ||
      typeof body.ics !== "string"
    ) {
      throw new BadRequestException("from, to and ics are required");
    }
    const outcome = await this.inbound.handleReply({
      from: body.from,
      recipients: [body.to],
      calendars: [body.ics],
      authFailed: false,
    });
    return { outcome };
  }

  /** Turns a user's calendar invites on or off (the later UI does this through settings). */
  @Post("calendar-invites/enabled")
  @HttpCode(200)
  async calendarInvitesEnabled(
    @Body() body: { userId?: unknown; enabled?: unknown },
  ): Promise<{ ok: true }> {
    if (
      typeof body?.userId !== "string" ||
      typeof body?.enabled !== "boolean"
    ) {
      throw new BadRequestException("userId and enabled are required");
    }
    await this.invites.setEnabled(body.userId, body.enabled);
    return { ok: true };
  }

  /** Issues the GitHub fake received, in creation order. */
  @Get("github/issues")
  githubIssues(): FakeIssue[] {
    return this.registry.github.createdIssues();
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

  /** Makes every issued Google refresh token fail with invalid-grant. */
  @Post("google/revoke-refresh-tokens")
  @HttpCode(200)
  revokeGoogleRefreshTokens(): { ok: true } {
    this.registry.googleOAuth.revokeAllRefreshTokens();
    return { ok: true };
  }

  /** Playlists the YouTube fake created through export, in creation order. */
  @Get("youtube/created-playlists")
  youtubeCreatedPlaylists(): {
    id: string;
    name: string;
    isPublic: boolean;
    videoIds: string[];
  }[] {
    return this.registry.youtube.createdPlaylists();
  }

  /** Makes YouTube playlist writes fail as if the daily quota ran out. */
  @Post("youtube/quota-exceeded")
  @HttpCode(200)
  setYoutubeQuotaExceeded(@Body() body: { on?: boolean }): { ok: true } {
    this.registry.youtube.setQuotaExceeded(body.on !== false);
    return { ok: true };
  }

  /** Makes YouTube refuse the given video ids when they are added to a playlist. */
  @Post("youtube/unavailable-videos")
  @HttpCode(200)
  setYoutubeUnavailableVideos(@Body() body: { ids?: string[] }): {
    ok: true;
  } {
    this.registry.youtube.setUnavailableVideos(body.ids ?? []);
    return { ok: true };
  }

  /** Seeds the MusicLink fake: links (platform to URL) for a source URL. */
  @Post("musiclink/seed")
  @HttpCode(200)
  seedMusicLink(
    @Body() body: { sourceUrl: string; links: Record<string, string> },
  ): {
    ok: true;
  } {
    this.registry.musiclink.seedLinks(body.sourceUrl, body.links);
    return { ok: true };
  }

  /** Makes the MusicLink fake fail every lookup, optionally with a Retry-After. */
  @Post("suggestions/failing")
  @HttpCode(200)
  setSuggestionsFailing(
    @Body() body: { musiclink?: boolean; retryAfterSeconds?: number },
  ): {
    ok: true;
  } {
    if (body.musiclink !== undefined) {
      this.registry.musiclink.setFailing(
        body.musiclink,
        body.retryAfterSeconds,
      );
    }
    return { ok: true };
  }

  /** Lookups the MusicLink fake received since the last reset. */
  @Get("suggestions/calls")
  suggestionCalls(): { musiclink: string[] } {
    return { musiclink: this.registry.musiclink.lookups() };
  }

  /** Makes the Ultimate Guitar fake throw UgUnavailableError on every call. */
  @Post("ug/failing")
  @HttpCode(200)
  setUgFailing(@Body() body: { failing: boolean }): { ok: true } {
    this.registry.ultimateGuitar.setFailing(body.failing);
    return { ok: true };
  }

  /** Searches and tab fetches the Ultimate Guitar fake received since reset. */
  @Get("ug/calls")
  ugCalls(): { searches: string[]; fetches: string[] } {
    return {
      searches: this.registry.ultimateGuitar.searches(),
      fetches: this.registry.ultimateGuitar.fetches(),
    };
  }

  /** Ages a cached link row by N days, as if it was fetched that long ago. */
  @Post("suggestions/age")
  @HttpCode(200)
  async ageLinkCache(
    @Body() body: { sourceUrl: string; days: number },
  ): Promise<{ ok: true; aged: boolean }> {
    const key = normalizeSourceUrl(body.sourceUrl);
    if (!key) throw new BadRequestException("sourceUrl is not allowed");
    const rows = await this.db
      .update(songLinkCache)
      .set({
        fetchedAt: sql`${songLinkCache.fetchedAt} - make_interval(days => ${body.days})`,
      })
      .where(eq(songLinkCache.sourceUrl, key))
      .returning({ sourceUrl: songLinkCache.sourceUrl });
    this.lookupState.clearCache();
    return { ok: true, aged: rows.length > 0 };
  }

  /** Drops the in-memory suggestion layer so the next lookup reads the table. */
  @Post("suggestions/clear-memory")
  @HttpCode(200)
  clearSuggestionMemory(): { ok: true } {
    this.lookupState.clearCache();
    return { ok: true };
  }

  /** The stored link-cache row for a source URL, or null. */
  @Get("suggestions/cache-row")
  async linkCacheRow(@Query("sourceUrl") sourceUrl: string): Promise<{
    row: { links: Record<string, string>; fetchedAt: string } | null;
  }> {
    const key = normalizeSourceUrl(sourceUrl);
    if (!key) return { row: null };
    const [row] = await this.db
      .select()
      .from(songLinkCache)
      .where(eq(songLinkCache.sourceUrl, key));
    return {
      row: row
        ? { links: row.links, fetchedAt: row.fetchedAt.toISOString() }
        : null,
    };
  }
}
