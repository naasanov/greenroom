"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calendarFeedLinkSchema,
  userSchema,
  type UpdateProfile,
} from "@greenroom/shared";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries";

const feedKey = (bandId: string) => ["bands", bandId, "calendar-feed"] as const;

/** The signed-in member's private subscription feed URLs for a band. */
export function useCalendarFeed(bandId: string, enabled = true) {
  return useQuery({
    queryKey: feedKey(bandId),
    enabled,
    queryFn: () =>
      api(`/bands/${bandId}/calendar-feed`, { schema: calendarFeedLinkSchema }),
  });
}

/** Issues a new feed URL; the old one stops resolving. */
export function useRotateCalendarFeed(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/bands/${bandId}/calendar-feed/rotate`, {
        method: "POST",
        schema: calendarFeedLinkSchema,
      }),
    onSuccess: (link) => qc.setQueryData(feedKey(bandId), link),
  });
}

/** Saves the invite opt-out and calendar email on the signed-in user. */
export function useSaveCalendarPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      patch: Pick<UpdateProfile, "calendarInvitesEnabled" | "calendarEmail">,
    ) => api("/auth/me", { method: "PATCH", body: patch, schema: userSchema }),
    onSuccess: (user) => qc.setQueryData(keys.me, user),
  });
}
