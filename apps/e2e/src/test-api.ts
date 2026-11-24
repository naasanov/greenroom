import type { APIRequestContext } from "@playwright/test";
import type { Scenario, SeedResult } from "@greenroom/db";

type SeedFor<S extends Scenario> = Extract<SeedResult, { scenario: S }>;

export interface MagicLink {
  to: string;
  link: string;
}

/** A calendar invite email captured by the email fake. */
export interface CalendarInviteEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  ics: string;
  method: "REQUEST" | "CANCEL";
  from?: string;
  sentAt: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface LoginResult {
  user: User;
  cookie: { name: string; value: string };
}

/** Typed client for the API's /__test__ control endpoints. */
export class TestApi {
  constructor(private readonly request: APIRequestContext) {}

  private async call<T>(
    method: "get" | "post",
    path: string,
    options?: Parameters<APIRequestContext["post"]>[1],
  ): Promise<T> {
    const res = await this.request[method](`/__test__/${path}`, options);
    if (!res.ok()) {
      throw new Error(
        `/__test__/${path} -> ${res.status()}: ${await res.text()}`,
      );
    }
    return (await res.json()) as T;
  }

  /** Truncates every app table and resets all fakes. */
  async reset(): Promise<void> {
    await this.call("post", "reset");
  }

  /** Resets, then loads a scenario. Returns the fixture ids and handles. */
  seed<S extends Scenario>(scenario: S): Promise<SeedFor<S>> {
    return this.call("post", "seed", { data: { scenario } });
  }

  /** Magic links the email fake has "sent" to this address, oldest first. */
  async magicLinksFor(email: string): Promise<MagicLink[]> {
    const { links } = await this.call<{ links: MagicLink[] }>(
      "get",
      "email/magic-links",
      { params: { to: email } },
    );
    return links;
  }

  /** Calendar invite emails the fake captured (optionally for one address); `clear` empties the log. */
  async calendarInvitesFor(
    to?: string,
    clear = false,
  ): Promise<CalendarInviteEmail[]> {
    const { invites } = await this.call<{ invites: CalendarInviteEmail[] }>(
      "get",
      "email/calendar-invites",
      { params: { ...(to ? { to } : {}), ...(clear ? { clear: "1" } : {}) } },
    );
    return invites;
  }

  /** Sends every pending calendar invite now (one band, or all). */
  async calendarInvitesFlush(bandId?: string): Promise<void> {
    await this.call("post", "calendar-invites/flush", { data: { bandId } });
  }

  /** Stores an inbound message so a signed webhook post can fetch it by id. */
  async addInboundEmail(input: {
    emailId: string;
    from: string;
    recipients: string[];
    calendars: string[];
    authFailed?: boolean;
  }): Promise<void> {
    await this.call("post", "email/inbound", { data: input });
  }

  /** Runs a parsed reply through the inbound handler without the webhook signature. */
  async calendarInviteReply(input: {
    from: string;
    to: string;
    ics: string;
  }): Promise<string> {
    const { outcome } = await this.call<{ outcome: string }>(
      "post",
      "calendar-invites/reply",
      { data: input },
    );
    return outcome;
  }

  /** Turns a user's calendar invites on or off. */
  async calendarInvitesEnabled(
    userId: string,
    enabled: boolean,
  ): Promise<void> {
    await this.call("post", "calendar-invites/enabled", {
      data: { userId, enabled },
    });
  }

  /** Creates the user if needed plus a session; returns the raw session cookie. */
  login(email: string): Promise<LoginResult> {
    return this.call("post", "login", { data: { email } });
  }

  /** Issues the GitHub fake received, in creation order. */
  async githubIssues(): Promise<
    {
      number: number;
      url: string;
      title: string;
      body: string;
      labels: string[];
    }[]
  > {
    return this.call("get", "github/issues");
  }

  /** Makes the Spotify fake reject every issued refresh token. */
  async revokeSpotifyRefreshTokens(): Promise<void> {
    await this.call("post", "spotify/revoke-refresh-tokens");
  }

  /** Playlists created in the Spotify fake by export, in creation order. */
  async spotifyCreatedPlaylists(): Promise<
    { id: string; name: string; isPublic: boolean; trackIds: string[] }[]
  > {
    return this.call("get", "spotify/created-playlists");
  }

  /** Makes the Google fake reject every issued refresh token. */
  async revokeGoogleRefreshTokens(): Promise<void> {
    await this.call("post", "google/revoke-refresh-tokens");
  }

  /** Playlists created in the YouTube fake by export, in creation order. */
  async youtubeCreatedPlaylists(): Promise<
    { id: string; name: string; isPublic: boolean; videoIds: string[] }[]
  > {
    return this.call("get", "youtube/created-playlists");
  }

  /** Makes YouTube playlist writes fail as if the daily quota ran out. */
  async setYoutubeQuotaExceeded(on: boolean): Promise<void> {
    await this.call("post", "youtube/quota-exceeded", { data: { on } });
  }

  /** Makes the YouTube fake refuse these video ids when added to a playlist. */
  async setYoutubeUnavailableVideos(ids: string[]): Promise<void> {
    await this.call("post", "youtube/unavailable-videos", { data: { ids } });
  }

  /** Seeds the MusicLink fake with platform links for a source URL. */
  async seedMusicLink(
    sourceUrl: string,
    links: Record<string, string>,
  ): Promise<void> {
    await this.call("post", "musiclink/seed", { data: { sourceUrl, links } });
  }

  /** Makes the MusicLink fake fail every lookup, optionally with a Retry-After. */
  async failSuggestions(failing: {
    musiclink?: boolean;
    retryAfterSeconds?: number;
  }): Promise<void> {
    await this.call("post", "suggestions/failing", { data: failing });
  }

  /** Lookups the MusicLink fake received since the last reset. */
  async suggestionCalls(): Promise<{ musiclink: string[] }> {
    return this.call("get", "suggestions/calls");
  }

  /** Ages the cached link row for a source URL by N days; false when none exists. */
  async ageLinkCache(sourceUrl: string, days: number): Promise<boolean> {
    const res = await this.call<{ aged: boolean }>("post", "suggestions/age", {
      data: { sourceUrl, days },
    });
    return res.aged;
  }

  /** Drops the in-memory suggestion layer so the next lookup reads the table. */
  async clearSuggestionMemory(): Promise<void> {
    await this.call("post", "suggestions/clear-memory");
  }

  /** The stored link-cache row for a source URL, or null. */
  async linkCacheRow(
    sourceUrl: string,
  ): Promise<{ links: Record<string, string>; fetchedAt: string } | null> {
    const res = await this.call<{
      row: { links: Record<string, string>; fetchedAt: string } | null;
    }>("get", "suggestions/cache-row", { params: { sourceUrl } });
    return res.row;
  }
}
