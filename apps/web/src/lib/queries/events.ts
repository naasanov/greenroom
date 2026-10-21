"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { z } from "zod";
import {
  gigLinkSchema,
  practiceLinkSchema,
  type CalendarEvent,
  type CreateGig,
  type CreatePractice,
  type EditScope,
  type Gig,
  type PracticeEditResult,
  type PracticeOccurrence,
  type PracticeSeries,
  type RsvpStatus,
  type UpdateGig,
  type UpdatePractice,
} from "@greenroom/shared";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries";

/** Passes an already-typed server response through without runtime parsing. */
const typed = <T>() => z.custom<T>();

export interface PlacePrediction {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  photoUrls: string[];
}

export const eventKeys = {
  all: (bandId: string) => ["bands", bandId, "events"] as const,
  range: (bandId: string, from: string, to: string) =>
    ["bands", bandId, "events", from, to] as const,
  series: (bandId: string, seriesId: string) =>
    ["bands", bandId, "practice-series", seriesId] as const,
  places: (bandId: string, q: string) =>
    ["bands", bandId, "places", q] as const,
};

/** Events (gigs plus expanded practice occurrences) between two instants. */
export function useEvents(
  bandId: string | undefined,
  range: { from: string; to: string } | null,
) {
  return useQuery({
    queryKey: eventKeys.range(bandId ?? "", range?.from ?? "", range?.to ?? ""),
    queryFn: () =>
      api(
        `/bands/${bandId}/events?from=${encodeURIComponent(range!.from)}&to=${encodeURIComponent(range!.to)}`,
        { schema: typed<CalendarEvent[]>() },
      ),
    enabled: !!bandId && !!range,
    placeholderData: keepPreviousData,
  });
}

export function usePracticeSeries(
  bandId: string | undefined,
  seriesId: string,
  enabled = true,
) {
  return useQuery({
    queryKey: eventKeys.series(bandId ?? "", seriesId),
    queryFn: () =>
      api(`/bands/${bandId}/practices/${seriesId}`, {
        schema: typed<PracticeSeries>(),
      }),
    enabled: !!bandId && enabled,
  });
}

export function usePlaceSuggestions(bandId: string | undefined, q: string) {
  const query = q.trim();
  return useQuery({
    queryKey: eventKeys.places(bandId ?? "", query),
    queryFn: () =>
      api(
        `/bands/${bandId}/places/autocomplete?q=${encodeURIComponent(query)}`,
        { schema: typed<PlacePrediction[]>() },
      ),
    enabled: !!bandId && query.length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export const fetchPlace = (bandId: string, placeId: string) =>
  api(`/bands/${bandId}/places/${encodeURIComponent(placeId)}`, {
    schema: typed<PlaceDetails>(),
  });

export function useCreateGig(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGig) =>
      api(`/bands/${bandId}/gigs`, {
        method: "POST",
        body,
        schema: typed<Gig>(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: eventKeys.all(bandId) }),
  });
}

export function useUpdateGig(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateGig) =>
      api(`/bands/${bandId}/gigs/${gigId}`, {
        method: "PATCH",
        body,
        schema: typed<Gig>(),
      }),
    onSuccess: (gig) => {
      qc.setQueryData(keys.gig(bandId, gigId), gig);
      void qc.invalidateQueries({ queryKey: eventKeys.all(bandId) });
    },
  });
}

export function useDeleteGig(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/bands/${bandId}/gigs/${gigId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.removeQueries({ queryKey: keys.gig(bandId, gigId) });
      return qc.invalidateQueries({ queryKey: eventKeys.all(bandId) });
    },
  });
}

export function useCreatePractice(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePractice) =>
      api(`/bands/${bandId}/practices`, {
        method: "POST",
        body,
        schema: typed<PracticeSeries>(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: eventKeys.all(bandId) }),
  });
}

export function useUpdatePractice(
  bandId: string,
  seriesId: string,
  occurrenceKey: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdatePractice) =>
      api(
        `/bands/${bandId}/practices/${seriesId}/occurrences/${occurrenceKey}`,
        { method: "PATCH", body, schema: typed<PracticeEditResult>() },
      ),
    onSuccess: (result) => {
      qc.removeQueries({ queryKey: ["bands", bandId, "practices"] });
      qc.removeQueries({ queryKey: eventKeys.series(bandId, seriesId) });
      if (result.occurrence) {
        qc.setQueryData(
          keys.occurrence(
            bandId,
            result.series.id,
            result.occurrence.occurrenceKey,
          ),
          result.occurrence,
        );
      }
      return qc.invalidateQueries({ queryKey: eventKeys.all(bandId) });
    },
  });
}

export function useDeletePractice(
  bandId: string,
  seriesId: string,
  occurrenceKey: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scope: EditScope) =>
      api(
        `/bands/${bandId}/practices/${seriesId}/occurrences/${occurrenceKey}?scope=${scope}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["bands", bandId, "practices"] });
      qc.removeQueries({ queryKey: eventKeys.series(bandId, seriesId) });
      return qc.invalidateQueries({ queryKey: eventKeys.all(bandId) });
    },
  });
}

/** Sets the signed-in user's RSVP; the occurrence cache updates before the server answers. */
export function useSetRsvp(
  bandId: string,
  seriesId: string,
  occurrenceKey: string,
  userId: string | undefined,
) {
  const qc = useQueryClient();
  const key = keys.occurrence(bandId, seriesId, occurrenceKey);
  return useMutation({
    mutationFn: (status: RsvpStatus) =>
      api(
        `/bands/${bandId}/practices/${seriesId}/occurrences/${occurrenceKey}/rsvp`,
        {
          method: "PUT",
          body: { status },
          schema: typed<PracticeOccurrence>(),
        },
      ),
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PracticeOccurrence>(key);
      qc.setQueryData<PracticeOccurrence>(key, (occ) =>
        occ
          ? {
              ...occ,
              myRsvp: status,
              attendees: occ.attendees.map((a) =>
                a.userId === userId ? { ...a, status } : a,
              ),
            }
          : occ,
      );
      return { previous };
    },
    onError: (_e, _s, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (occ) => qc.setQueryData(key, occ),
  });
}

// ---- deep link resolution that can sit idle (no selection) ----

/** Like `useGigLink`, but disabled while `gigId` is null. */
export function useGigLinkFor(gigId: string | null) {
  return useQuery({
    queryKey: keys.link("gigs", gigId ?? ""),
    queryFn: () =>
      api(`/links/gigs/${encodeURIComponent(gigId!)}`, {
        schema: gigLinkSchema,
      }),
    enabled: !!gigId,
    retry: false,
  });
}

/** Like `usePracticeLink`, but disabled while `seriesId` is null. */
export function usePracticeLinkFor(
  seriesId: string | null,
  date: string | null,
) {
  return useQuery({
    queryKey: keys.link("practices", seriesId ?? "", date),
    queryFn: () =>
      api(
        `/links/practices/${encodeURIComponent(seriesId!)}${
          date ? `?date=${encodeURIComponent(date)}` : ""
        }`,
        { schema: practiceLinkSchema },
      ),
    enabled: !!seriesId,
    retry: false,
  });
}
