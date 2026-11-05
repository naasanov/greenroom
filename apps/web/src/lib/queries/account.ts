"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { deletionPreviewSchema, type DeleteAccount } from "@greenroom/shared";
import { api } from "@/lib/api";

export function useDeletionPreview(enabled: boolean) {
  return useQuery({
    queryKey: ["me", "deletion-preview"],
    queryFn: () =>
      api("/users/me/deletion-preview", { schema: deletionPreviewSchema }),
    enabled,
    gcTime: 0,
  });
}

/** Deletes the account, then hard-navigates so no client state survives. */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (body: DeleteAccount) =>
      api("/users/me", { method: "DELETE", body }),
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    onSuccess: () => (window.location.href = "/sign-in"),
  });
}
