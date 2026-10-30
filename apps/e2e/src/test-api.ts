import type { APIRequestContext } from "@playwright/test";
import type { Scenario, SeedResult } from "@greenroom/db";

/** A user rule on a fake calendar's ACL. */
export interface FakeAclRule {
  id: string;
  email: string;
  role: "owner" | "writer" | "reader" | "freeBusyReader";
}

/** An event in the Google Calendar fake (the fields specs assert on). */
export interface FakeCalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  recurrence: string[];
  cancelled: boolean;
  etag: string;
  allDay: boolean;
  timeZone: string | null;
  privateProperties: Record<string, string>;
  recurringEventId: string | null;
  originalStart: string | null;
}

export interface FakeEventPatch {
  summary?: string;
  description?: string | null;
  location?: string | null;
  start?: string;
  end?: string;
  recurrence?: string[];
  timeZone?: string;
  allDay?: boolean;
}

type SeedFor<S extends Scenario> = Extract<SeedResult, { scenario: S }>;

export interface MagicLink {
  to: string;
  link: string;
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

  /** Creates the user if needed plus a session; returns the raw session cookie. */
  login(email: string): Promise<LoginResult> {
    return this.call("post", "login", { data: { email } });
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

  // ---- Google Calendar sync ----

  /** Applies every pending app-to-Google push now (one band, or all). */
  async calendarFlush(bandId?: string): Promise<void> {
    await this.call("post", "calendar/flush", { data: { bandId } });
  }

  /** Runs one pull pass (Google to app) for the band, then flushes pending pushes. */
  async calendarSync(bandId: string): Promise<void> {
    await this.call("post", "calendar/sync", { data: { bandId } });
  }

  /** Name and time zone a fake calendar was created with. */
  calendarInfo(
    calendarId: string,
  ): Promise<{ summary: string; timeZone: string } | null> {
    return this.call("get", "calendar/info", { params: { calendarId } });
  }

  /** Every event in a fake Google calendar, cancelled ones included. */
  calendarEvents(calendarId: string): Promise<FakeCalendarEvent[]> {
    return this.call("get", "calendar/events", { params: { calendarId } });
  }

  /** Simulates an edit made in the Google Calendar UI. */
  async calendarEdit(
    calendarId: string,
    eventId: string,
    patch: FakeEventPatch,
  ): Promise<void> {
    await this.call("post", "calendar/simulate/edit", {
      data: { calendarId, eventId, patch },
    });
  }

  /** Simulates editing or cancelling one occurrence in Google (`originalStart` is an ISO instant). */
  async calendarInstanceEdit(
    calendarId: string,
    recurringEventId: string,
    originalStart: string,
    patch: FakeEventPatch & { cancelled?: boolean },
  ): Promise<void> {
    await this.call("post", "calendar/simulate/instance-edit", {
      data: { calendarId, recurringEventId, originalStart, patch },
    });
  }

  async calendarDelete(calendarId: string, eventId: string): Promise<void> {
    await this.call("post", "calendar/simulate/delete", {
      data: { calendarId, eventId },
    });
  }

  /** ACL rules of a fake calendar, owner included. */
  calendarAcl(calendarId: string): Promise<FakeAclRule[]> {
    return this.call("post", "calendar/acl", { data: { calendarId } });
  }

  /** Simulates the owner sharing the calendar by hand in Google. */
  async calendarSimulateAcl(calendarId: string, email: string): Promise<void> {
    await this.call("post", "calendar/simulate/acl-rule", {
      data: { calendarId, email },
    });
  }

  /** Makes every sync token issued so far report as expired. */
  async calendarExpireSyncTokens(calendarId: string): Promise<void> {
    await this.call("post", "calendar/expire-sync-tokens", {
      data: { calendarId },
    });
  }
}
