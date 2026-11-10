"use client";

import { useSyncExternalStore } from "react";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const listeners = new Set<() => void>();

const bannerKey = (userId: string, bandId: string) =>
  `greenroom:calendar-invites-banner:${userId}:${bandId}`;
const nudgeKey = (userId: string) =>
  `greenroom:calendar-invites-nudge:${userId}`;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the state then lasts for this page load only.
  }
  listeners.forEach((l) => l());
}

type BannerState = {
  dismissedAt?: number;
  opened?: boolean;
  feed?: boolean;
};

function parse(raw: string | null): BannerState {
  try {
    const v = raw ? (JSON.parse(raw) as BannerState) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

// Page-load fallback for blocked storage.
const memory = new Map<string, BannerState>();

function update(key: string, patch: BannerState) {
  const next = { ...(memory.get(key) ?? parse(read(key))), ...patch };
  memory.set(key, next);
  write(key, JSON.stringify(next));
}

/**
 * Banner visibility for one member in one band: hidden for a week after a
 * dismiss, and hidden once invites are on or the member has opened the dialog.
 */
export function useInvitesBanner(
  userId: string | undefined,
  bandId: string,
  invitesEnabled: boolean | undefined,
) {
  const key = userId ? bannerKey(userId, bandId) : "";
  const snapshot = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => {
      if (!key) return "pending";
      const s = memory.get(key) ?? parse(read(key));
      const dismissed = !!s.dismissedAt && Date.now() - s.dismissedAt < WEEK_MS;
      return `${dismissed ? "d" : ""}${s.opened ? "o" : ""}`;
    },
    () => "pending",
  );
  const hidden =
    snapshot === "pending" ||
    snapshot.includes("d") ||
    snapshot.includes("o") ||
    invitesEnabled !== false;
  return {
    hidden,
    dismiss: () => key && update(key, { dismissedAt: Date.now() }),
  };
}

/** True once per user: the first call returns true and records it. */
export function takeFirstEventNudge(userId: string): boolean {
  if (read(nudgeKey(userId))) return false;
  write(nudgeKey(userId), "1");
  return true;
}

/** Records that the member opened the dialog from this band's Events tab. */
export function markInvitesOpened(userId: string, bandId: string) {
  update(bannerKey(userId, bandId), { opened: true });
}

function useBandPrefs(userId: string | undefined, bandId: string) {
  const key = userId ? bannerKey(userId, bandId) : "";
  const feed = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => !!key && !!(memory.get(key) ?? parse(read(key))).feed,
    () => false,
  );
  return { key, feed };
}

export type CalendarMethod = "email" | "feed" | "both" | null;

/**
 * The member's current way of getting events. Email invites are server state.
 * The subscribe link exists for every member, so using it is remembered per
 * band on this device from the moment its step is opened.
 */
export function useCalendarMethod(
  userId: string | undefined,
  bandId: string,
  invitesEnabled: boolean | undefined,
): CalendarMethod {
  const { feed } = useBandPrefs(userId, bandId);
  if (invitesEnabled && feed) return "both";
  if (invitesEnabled) return "email";
  return feed ? "feed" : null;
}

/** Remembers (or forgets) that the member uses the subscribe link in this band. */
export function setFeedInUse(userId: string, bandId: string, inUse: boolean) {
  update(bannerKey(userId, bandId), { feed: inUse });
}
