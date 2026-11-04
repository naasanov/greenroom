"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import type { UploadEntry } from "./upload-store";
import { useUploadStore } from "./upload-provider";
import { BatchBar, batchFraction, isActive } from "./upload-progress";

/** Single place that builds the link back to a gig's media page. */
const uploadHref = (e: UploadEntry) =>
  e.gigId === null ? "/files" : `/gigs/${e.gigId}/media`;

const onMediaPage = (pathname: string) =>
  /^\/gigs\/[^/]+\/media\/?$/.test(pathname);

/** Compact bottom bar shown on every page but the media page while uploads run. */
export function GlobalUploadIndicator() {
  const store = useUploadStore();
  const pathname = usePathname();
  const entries = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => [],
  );
  const media = onMediaPage(pathname);
  const first = entries.find((e) => isActive(e) && !(media && e.gigId));
  if (!first) return null;

  const counted = entries.filter((e) => e.status !== "readd" && !e.restored);
  const finished = counted.filter((e) => e.status === "done").length;
  const percent = Math.round(batchFraction(entries) * 100);
  return (
    <Link
      href={uploadHref(first)}
      data-testid="global-upload-indicator"
      className="fixed inset-x-0 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] pointer-events-auto z-[35] block border-t bg-background shadow-lift md:bottom-0"
    >
      <BatchBar entries={entries} className="absolute inset-x-0 top-0" />
      <span className="flex items-center gap-2 px-4 py-2.5 text-sm">
        <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
        <span data-testid="global-upload-text" className="font-medium">
          Uploading {Math.min(finished + 1, counted.length)} of {counted.length}
        </span>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {percent}%
        </span>
      </span>
    </Link>
  );
}
