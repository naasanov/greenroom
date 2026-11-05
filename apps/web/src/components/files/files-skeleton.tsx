/** Placeholder rows shown while the Files route code or a folder listing loads. */
export function FilesSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="files-skeleton"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/60" />
      ))}
    </div>
  );
}
