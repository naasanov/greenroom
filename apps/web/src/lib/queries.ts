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
  myInstrumentsSchema,
  userSchema,
  type CreateBand,
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
};

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
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bands }),
  });
}

export function useCreateBand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBand) =>
      api("/bands", { method: "POST", body, schema: bandSummarySchema }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.bands }),
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
