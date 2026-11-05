import { FilesSkeleton } from "@/components/files/files-skeleton";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl p-3 pb-28 md:p-4">
      <FilesSkeleton />
    </div>
  );
}
