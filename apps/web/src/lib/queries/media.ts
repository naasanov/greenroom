"use client";

import { useQuery } from "@tanstack/react-query";
import { gigMediaSchema } from "@greenroom/shared";
import { api } from "@/lib/api";
import { googleKeys } from "@/lib/queries/google";

/** Media of one gig (folders, unsorted items, counts). */
export function useGigMedia(bandId: string, gigId: string) {
  return useQuery({
    queryKey: [...googleKeys.media(bandId), gigId] as const,
    queryFn: () =>
      api(`/bands/${bandId}/gigs/${gigId}/media`, { schema: gigMediaSchema }),
  });
}
