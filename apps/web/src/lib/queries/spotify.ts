"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api, getApiUrl } from "@/lib/api";

export interface SpotifyStatus {
  connected: boolean;
  displayName: string | null;
}

export const spotifyKey = ["integrations", "spotify"] as const;

/** Whether the signed-in user has connected Spotify. */
export function useSpotifyStatus() {
  return useQuery({
    queryKey: spotifyKey,
    queryFn: () =>
      api("/integrations/spotify", { schema: z.custom<SpotifyStatus>() }),
  });
}

export function useDisconnectSpotify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/integrations/spotify", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: spotifyKey }),
  });
}

/** Full-page URL that starts the Spotify login and returns to `redirectTo`. */
export function spotifyStartUrl(redirectTo: string): string {
  return `${getApiUrl()}/integrations/spotify/start?${new URLSearchParams({ redirectTo })}`;
}

/** Sends the browser through the Spotify login, returning to `redirectTo`. */
export function connectSpotify(redirectTo: string) {
  window.location.assign(spotifyStartUrl(redirectTo));
}

/** Removes the given params from the current URL query, returning the new path. */
export function pathWithout(
  pathname: string,
  search: URLSearchParams,
  drop: string[],
): string {
  const next = new URLSearchParams(search);
  for (const k of drop) next.delete(k);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
