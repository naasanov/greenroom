import { cn } from "@/lib/utils";
import type { UploadEntry } from "./upload-store";

export function isActive(e: UploadEntry) {
  return e.status === "queued" || e.status === "uploading";
}

/** Overall byte progress (0..1) across entries uploaded in this page's queue. */
export function batchFraction(entries: UploadEntry[]) {
  const counted = entries.filter(
    (e) => e.status !== "readd" && e.status !== "error" && !e.restored,
  );
  const total = counted.reduce((n, e) => n + e.totalBytes, 0);
  const sent = counted.reduce((n, e) => n + e.sent, 0);
  return total > 0 ? Math.min(1, sent / total) : 0;
}

/** Thin blue progress bar; the parent positions it. */
export function BatchBar({
  entries,
  className,
}: {
  entries: UploadEntry[];
  className?: string;
}) {
  const fraction = batchFraction(entries);
  return (
    <div
      role="progressbar"
      aria-label="Batch progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      data-testid="upload-batch"
      className={cn("h-1 bg-transparent", className)}
    >
      <div
        className="h-full bg-blue-500 transition-[width] duration-300 ease-linear"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}
