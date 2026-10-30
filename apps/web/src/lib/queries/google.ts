"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  driveStatusSchema,
  fakePickerSchema,
  googleIntegrationsSchema,
  googlePickerConfigSchema,
  type CalendarSetupResult,
  type CalendarSyncStatus,
  type GoogleService,
} from "@greenroom/shared";
import { api, getApiUrl } from "@/lib/api";

const base = (bandId: string) => `/bands/${bandId}/integrations/google`;

export const googleKeys = {
  all: (bandId: string) => ["bands", bandId, "google"] as const,
  status: (bandId: string) => ["bands", bandId, "google", "status"] as const,
  drive: (bandId: string) => ["bands", bandId, "google", "drive"] as const,
  sync: (bandId: string) => ["bands", bandId, "google", "sync"] as const,
  fakePicker: (bandId: string) =>
    ["bands", bandId, "google", "fake-picker"] as const,
  media: (bandId: string) => ["bands", bandId, "gig-media"] as const,
};

/** Link state of the band's Google Drive and Calendar. */
export function useGoogleIntegrations(bandId: string | undefined) {
  return useQuery({
    queryKey: googleKeys.status(bandId ?? ""),
    enabled: !!bandId,
    queryFn: () => api(base(bandId!), { schema: googleIntegrationsSchema }),
  });
}

/** Drive setup state (folder, folder URL); only fetched once Drive is linked. */
export function useDriveStatus(bandId: string, enabled: boolean) {
  return useQuery({
    queryKey: googleKeys.drive(bandId),
    enabled,
    queryFn: () =>
      api(`${base(bandId)}/drive/status`, { schema: driveStatusSchema }),
  });
}

export function useCalendarSync(bandId: string, enabled: boolean) {
  return useQuery({
    queryKey: googleKeys.sync(bandId),
    enabled,
    queryFn: () =>
      api(`${base(bandId)}/calendar/sync`, {
        schema: z.custom<CalendarSyncStatus>(),
      }),
  });
}

/** Full-page navigation through the Google sign-in, returning to `redirectTo`. */
export function connectGoogle(
  bandId: string,
  service: GoogleService,
  redirectTo: string,
) {
  const qs = new URLSearchParams({ redirectTo });
  window.location.assign(
    `${getApiUrl()}${base(bandId)}/${service}/start?${qs}`,
  );
}

export function useDisconnectGoogle(bandId: string, service: GoogleService) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api(`${base(bandId)}/${service}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: googleKeys.all(bandId) });
      void qc.invalidateQueries({ queryKey: googleKeys.media(bandId) });
    },
  });
}

export function useCalendarSetup(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api(`${base(bandId)}/calendar/setup`, {
        method: "POST",
        body: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        schema: z.custom<CalendarSetupResult>(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: googleKeys.all(bandId) }),
  });
}

export function fetchPickerConfig(bandId: string) {
  return api(`${base(bandId)}/drive/picker-config`, {
    schema: googlePickerConfigSchema,
  });
}

export function useFakePicker(bandId: string, enabled: boolean) {
  return useQuery({
    queryKey: googleKeys.fakePicker(bandId),
    enabled,
    gcTime: 0,
    queryFn: () =>
      api(`${base(bandId)}/drive/fake-picker`, { schema: fakePickerSchema }),
  });
}

export function useSetDriveFolder(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (folderId: string) =>
      api(`${base(bandId)}/drive/folder`, {
        method: "POST",
        body: { folderId },
        schema: driveStatusSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: googleKeys.all(bandId) });
      void qc.invalidateQueries({ queryKey: googleKeys.media(bandId) });
    },
  });
}

export function useCreateDriveFolder(bandId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api(`${base(bandId)}/drive/folders`, {
        method: "POST",
        body: { name },
        schema: driveStatusSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: googleKeys.all(bandId) });
      void qc.invalidateQueries({ queryKey: googleKeys.media(bandId) });
    },
  });
}
