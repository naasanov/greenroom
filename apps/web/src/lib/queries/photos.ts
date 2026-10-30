"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  driveStatusSchema,
  MAX_BAND_PHOTO_BYTES,
  memberPhotoSchema,
  bandPhotoSchema,
} from "@greenroom/shared";
import { ApiError, api, getApiUrl } from "@/lib/api";
import { keys } from "@/lib/queries";

export const NOT_LINKED_NOTE =
  "Link Google Drive in Band settings to add photos";

/** Client-side check; returns a friendly message or null when the file is fine. */
export function validatePhotoFile(file: File): string | null {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return "That file is not a photo. Choose a JPG, PNG, or similar image.";
  }
  if (file.size > MAX_BAND_PHOTO_BYTES) {
    return "That photo is over 10 MB. Choose a smaller one.";
  }
  return null;
}

/** Maps an upload failure to a short message for the user. */
export function photoErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 409) return `${NOT_LINKED_NOTE}.`;
    if (e.status === 413)
      return "That photo is over 10 MB. Choose a smaller one.";
    if (e.status === 422) {
      return "That file is not a photo. Choose a JPG, PNG, or similar image.";
    }
  }
  return "We could not update the photo. Please try again.";
}

async function upload<T>(
  path: string,
  file: File,
  parse: (data: unknown) => T,
): Promise<T> {
  const form = new FormData();
  form.append("photo", file, file.name);
  const res = await fetch(`${getApiUrl()}${path}`, {
    method: "PUT",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    let code: string | undefined;
    try {
      const data = (await res.json()) as { code?: unknown };
      if (typeof data.code === "string") code = data.code;
    } catch {
      // Non-JSON error body.
    }
    throw new ApiError(res.status, res.statusText || "Upload failed", code);
  }
  return parse(await res.json());
}

export function useDriveStatus(bandId: string | undefined) {
  return useQuery({
    queryKey: ["bands", bandId, "photos", "drive-status"] as const,
    queryFn: () =>
      api(`/bands/${bandId}/integrations/google/drive/status`, {
        schema: driveStatusSchema,
      }),
    enabled: !!bandId,
  });
}

export function useBandPhoto(bandId: string) {
  const qc = useQueryClient();
  const done = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: keys.bands, exact: true }),
      qc.invalidateQueries({ queryKey: keys.band(bandId) }),
    ]);
  return {
    upload: useMutation({
      mutationFn: (file: File) =>
        upload(`/bands/${bandId}/photo`, file, (d) => bandPhotoSchema.parse(d)),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: () => api(`/bands/${bandId}/photo`, { method: "DELETE" }),
      onSuccess: done,
    }),
  };
}

/** The user's single profile photo; every band's member lists refresh with it. */
export function useMyPhoto() {
  const qc = useQueryClient();
  const done = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: keys.me }),
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "bands" && q.queryKey[2] === "members",
      }),
    ]);
  };
  return {
    upload: useMutation({
      mutationFn: (file: File) =>
        upload("/users/me/photo", file, (d) => memberPhotoSchema.parse(d)),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: () => api("/users/me/photo", { method: "DELETE" }),
      onSuccess: done,
    }),
  };
}
