"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  authResultSchema,
  bandMemberSchema,
  bandSummarySchema,
  inviteLinkSchema,
  invitePreviewSchema,
  gigLinkSchema,
  myInstrumentsSchema,
  practiceLinkSchema,
  songLinkSchema,
  userSchema,
  type CreateBand,
  type Gig,
  type PracticeOccurrence,
  type SongDetail,
  type User,
  type MagicLinkRequest,
  type SetInstruments,
  type UpdateProfile,
} from "@greenroom/shared";
import { api, isApiError } from "@/lib/api";

export const keys = {
  me: ["me"] as const,
  bands: ["bands"] as const,
  members: (bandId: string) => ["bands", bandId, "members"] as const,
  invite: (bandId: string) => ["bands", bandId, "invite"] as const,
  invitePreview: (token: string) => ["invites", token] as const,
  instruments: ["me", "instruments"] as const,
  link: (kind: string, id: string, date?: string | null) =>
    ["links", kind, id, date ?? null] as const,
  gig: (bandId: string, id: string) => ["bands", bandId, "gigs", id] as const,
  occurrence: (bandId: string, seriesId: string, key: string) =>
    ["bands", bandId, "practices", seriesId, key] as const,
  song: (bandId: string, id: string) => ["bands", bandId, "songs", id] as const,
};

/** Refreshes the user (server-side current band) and the band list together. */
const refreshBands = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: keys.me }),
    qc.invalidateQueries({ queryKey: keys.bands }),
  ]);

/** Current user; `data` is null when signed out (401). */
export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api("/auth/me", { schema: userSchema });
      } catch (e) {
        if (isApiError(e, 401)) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useBands(enabled = true) {
  return useQuery({
    queryKey: keys.bands,
    queryFn: () => api("/bands", { schema: z.array(bandSummarySchema) }),
    enabled,
  });
}

export function useMembers(bandId: string | undefined) {
  return useQuery({
    queryKey: keys.members(bandId ?? ""),
    queryFn: () =>
      api(`/bands/${bandId}/members`, { schema: z.array(bandMemberSchema) }),
    enabled: !!bandId,
  });
}

export function useInviteLink(bandId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.invite(bandId ?? ""),
    queryFn: () => api(`/bands/${bandId}/invite`, { schema: inviteLinkSchema }),
    enabled: !!bandId && enabled,
  });
}

export function useResetInvite(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/bands/${bandId}/invite/reset`, {
        method: "POST",
        schema: inviteLinkSchema,
      }),
    onSuccess: (link) => qc.setQueryData(keys.invite(bandId), link),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: keys.invitePreview(token),
    queryFn: () =>
      api(`/invites/${encodeURIComponent(token)}`, {
        schema: invitePreviewSchema,
      }),
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        schema: bandSummarySchema,
      }),
    onSuccess: () => refreshBands(qc),
  });
}

export function useCreateBand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBand) =>
      api("/bands", { method: "POST", body, schema: bandSummarySchema }),
    onSuccess: () => refreshBands(qc),
  });
}

/** Makes a band current: updates the cached user at once, then tells the server. */
export function useSetCurrentBand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bandId: string) =>
      api("/me/current-band", { method: "PUT", body: { bandId } }),
    onMutate: (bandId) => {
      qc.setQueryData<User | null>(keys.me, (me) =>
        me ? { ...me, lastBandId: bandId } : me,
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

// ---- deep link resolvers and band-scoped reads ----

export function useGigLink(gigId: string) {
  return useQuery({
    queryKey: keys.link("gigs", gigId),
    queryFn: () =>
      api(`/links/gigs/${encodeURIComponent(gigId)}`, {
        schema: gigLinkSchema,
      }),
    retry: false,
  });
}

export function useSongLink(songId: string) {
  return useQuery({
    queryKey: keys.link("songs", songId),
    queryFn: () =>
      api(`/links/songs/${encodeURIComponent(songId)}`, {
        schema: songLinkSchema,
      }),
    retry: false,
  });
}

export function usePracticeLink(seriesId: string, date: string | null) {
  return useQuery({
    queryKey: keys.link("practices", seriesId, date),
    queryFn: () =>
      api(
        `/links/practices/${encodeURIComponent(seriesId)}${
          date ? `?date=${encodeURIComponent(date)}` : ""
        }`,
        { schema: practiceLinkSchema },
      ),
    retry: false,
  });
}

/** Passes an already-typed server response through without runtime parsing. */
const typed = <T>() => z.custom<T>();

export function useGig(bandId: string | undefined, gigId: string) {
  return useQuery({
    queryKey: keys.gig(bandId ?? "", gigId),
    queryFn: () =>
      api(`/bands/${bandId}/gigs/${gigId}`, { schema: typed<Gig>() }),
    enabled: !!bandId,
  });
}

export function usePracticeOccurrence(
  bandId: string | undefined,
  seriesId: string,
  key: string | null | undefined,
) {
  return useQuery({
    queryKey: keys.occurrence(bandId ?? "", seriesId, key ?? ""),
    queryFn: () =>
      api(`/bands/${bandId}/practices/${seriesId}/occurrences/${key}`, {
        schema: typed<PracticeOccurrence>(),
      }),
    enabled: !!bandId && !!key,
  });
}

export function useSong(bandId: string | undefined, songId: string) {
  return useQuery({
    queryKey: keys.song(bandId ?? "", songId),
    queryFn: () =>
      api(`/bands/${bandId}/songs/${songId}`, { schema: typed<SongDetail>() }),
    enabled: !!bandId,
  });
}

export const requestMagicLink = (body: MagicLinkRequest) =>
  api("/auth/magic-link", { method: "POST", body });

export async function verifyMagicLink(token: string, qc: QueryClient) {
  const result = await api("/auth/magic-link/verify", {
    method: "POST",
    body: { token },
    schema: authResultSchema,
  });
  qc.setQueryData(keys.me, result.user);
  return result;
}

export function useMyInstruments(enabled = true) {
  return useQuery({
    queryKey: keys.instruments,
    queryFn: () => api("/me/instruments", { schema: myInstrumentsSchema }),
    enabled,
  });
}

/** Saves display name and instruments for the welcome screen. */
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      profile: UpdateProfile;
      instruments: SetInstruments;
    }) => {
      const user = await api("/auth/me", {
        method: "PATCH",
        body: v.profile,
        schema: userSchema,
      });
      await api("/me/instruments", {
        method: "PUT",
        body: v.instruments,
        schema: myInstrumentsSchema,
      });
      return user;
    },
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user);
      void qc.invalidateQueries({ queryKey: keys.instruments });
    },
  });
}

/** Ends the session, then hard-navigates so no client state survives. */
export function useSignOut() {
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    onSuccess: () => (window.location.href = "/sign-in"),
  });
}
