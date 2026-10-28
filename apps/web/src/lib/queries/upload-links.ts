"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  publicUploadLinkInfoSchema,
  uploadLinkSchema,
  type CreatePublicUpload,
  type PublicUploadLinkInfo,
  type UploadLink,
  type UploadLinkInvalidReason,
  type UploadSession,
} from "@greenroom/shared";
import { ApiError, api, getApiUrl } from "@/lib/api";
import { sendChunk, type UploadEndpoints } from "@/lib/uploader";

const linksKey = (bandId: string, gigId: string) =>
  ["bands", bandId, "gigs", gigId, "upload-links"] as const;

/** Active and recent upload links of one gig. */
export function useUploadLinks(
  bandId: string,
  gigId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: linksKey(bandId, gigId),
    enabled,
    queryFn: () =>
      api(`/bands/${bandId}/gigs/${gigId}/upload-links`, {
        schema: z.array(uploadLinkSchema),
      }),
  });
}

/** Whether a link still accepts uploads. */
export const isLinkActive = (l: UploadLink): boolean =>
  !l.revokedAt &&
  (!l.expiresAt || new Date(l.expiresAt).getTime() > Date.now());

export function useCreateUploadLink(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { days: 1 | 7 | 30; fresh?: boolean }) =>
      api(
        `/bands/${bandId}/gigs/${gigId}/upload-links${input.fresh ? "?new=1" : ""}`,
        {
          method: "POST",
          body: { expiresInDaysAfterGig: input.days },
          schema: uploadLinkSchema,
        },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: linksKey(bandId, gigId) }),
  });
}

export function useRevokeUploadLink(bandId: string, gigId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      api(`/bands/${bandId}/upload-links/${linkId}`, {
        method: "DELETE",
        schema: uploadLinkSchema,
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: linksKey(bandId, gigId) }),
  });
}

// ---- public (no session) ----

/** Thrown when the API refuses a token; `reason` says why. */
export class UploadLinkInvalidError extends Error {
  constructor(readonly reason: UploadLinkInvalidReason) {
    super("This upload link is not available");
    this.name = "UploadLinkInvalidError";
  }
}

const publicBase = (token: string) =>
  `${getApiUrl()}/public/upload-links/${encodeURIComponent(token)}`;

async function readError(res: Response): Promise<Error> {
  let data: { message?: unknown; code?: unknown; reason?: unknown } = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON body.
  }
  if (res.status === 404 && data.code === "UPLOAD_LINK_INVALID") {
    const r = data.reason;
    return new UploadLinkInvalidError(
      r === "expired" || r === "revoked" ? r : "unknown",
    );
  }
  return new ApiError(
    res.status,
    typeof data.message === "string" ? data.message : res.statusText,
    typeof data.code === "string" ? data.code : undefined,
  );
}

export async function fetchPublicLinkInfo(
  token: string,
): Promise<PublicUploadLinkInfo> {
  const res = await fetch(publicBase(token), { credentials: "omit" });
  if (!res.ok) throw await readError(res);
  return publicUploadLinkInfoSchema.parse(await res.json());
}

/** Upload endpoints for the anonymous page; sessions are slim but engine-compatible. */
export function publicEndpoints(
  token: string,
  uploaderName: () => string,
): UploadEndpoints {
  return {
    async create(input) {
      const name = uploaderName().trim();
      const body: CreatePublicUpload = {
        ...input,
        ...(name ? { uploaderName: name } : {}),
      };
      const res = await fetch(`${publicBase(token)}/uploads`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw await readError(res);
      return (await res.json()) as UploadSession;
    },
    async chunk(sessionId, start, endInclusive, total, body, signal) {
      return sendChunk(
        `${publicBase(token)}/uploads/${sessionId}`,
        start,
        endInclusive,
        total,
        body,
        signal,
        { credentials: "omit" },
      );
    },
  };
}
