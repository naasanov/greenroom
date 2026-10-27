import { useSyncExternalStore } from "react";
import type { MediaItem } from "@greenroom/shared";
import { getApiUrl } from "@/lib/api";

export const downloadUrl = (item: MediaItem) =>
  `${item.contentUrl}${item.contentUrl.includes("?") ? "&" : "?"}download=1`;

export function zipUrl(bandId: string, ids: string[]) {
  return `${getApiUrl()}/bands/${bandId}/media/zip?ids=${ids.join(",")}`;
}

/** Starts a browser download by navigating to a URL through a temporary anchor. */
export function startDownload(url: string, name?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (name) a.download = name;
  a.rel = "noreferrer";
  document.body.append(a);
  a.click();
  a.remove();
}

/** True when the browser can share files (phones with a native share sheet). */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: [new File(["x"], "x.png", { type: "image/png" })],
    });
  } catch {
    return false;
  }
}

/** True on touch-first devices, where the share sheet replaces zip downloads. */
export function prefersShareSheet(): boolean {
  return (
    canShareFiles() &&
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** Fetches the items and opens the native share sheet with them as files. */
export async function shareItems(items: MediaItem[]): Promise<boolean> {
  const files = await Promise.all(
    items.map(async (i) => {
      const res = await fetch(i.contentUrl, { credentials: "include" });
      const blob = await res.blob();
      return new File([blob], i.name, {
        type: i.mimeType ?? blob.type,
      });
    }),
  );
  if (!navigator.canShare?.({ files })) return false;
  try {
    await navigator.share({ files });
  } catch (e) {
    if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
  }
  return true;
}

const noopSubscribe = () => () => {};

/** Whether the share sheet applies (false during server render). */
export function useShareSheet(kind: "files" | "touch"): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => (kind === "files" ? canShareFiles() : prefersShareSheet()),
    () => false,
  );
}
