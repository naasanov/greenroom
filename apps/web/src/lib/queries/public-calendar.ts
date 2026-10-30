"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  publicCalendarLinkSchema,
  publicCalendarSchema,
  type PublicCalendar,
} from "@greenroom/shared";
import { ApiError, api, getApiUrl } from "@/lib/api";

const linkKey = (bandId: string) =>
  ["bands", bandId, "public-calendar"] as const;

export function usePublicCalendarLink(bandId: string) {
  return useQuery({
    queryKey: linkKey(bandId),
    queryFn: () =>
      api(`/bands/${bandId}/public-calendar`, {
        schema: publicCalendarLinkSchema,
      }),
  });
}

export function useResetPublicCalendarLink(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`/bands/${bandId}/public-calendar/reset`, {
        method: "POST",
        schema: publicCalendarLinkSchema,
      }),
    onSuccess: (link) => qc.setQueryData(linkKey(bandId), link),
  });
}

/** Anonymous read; no cookies are sent. */
export async function fetchPublicCalendar(
  token: string,
): Promise<PublicCalendar> {
  const res = await fetch(
    `${getApiUrl()}/public/calendar/${encodeURIComponent(token)}`,
    { credentials: "omit" },
  );
  if (!res.ok) throw new ApiError(res.status, res.statusText);
  return publicCalendarSchema.parse(await res.json());
}
