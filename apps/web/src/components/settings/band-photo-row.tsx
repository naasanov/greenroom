"use client";

import { BandAvatar } from "@/components/app/band-switcher";
import { PhotoUpload } from "@/components/app/photo-upload";
import {
  NOT_LINKED_NOTE,
  useBandPhoto,
  useDriveStatus,
} from "@/lib/queries/photos";
import { useBandDetail, useBands } from "@/lib/queries";

/** Band name and photo row for admins; disabled until Drive has a folder. */
export function BandPhotoRow({ bandId }: { bandId: string }) {
  const detail = useBandDetail(bandId);
  const bands = useBands();
  const status = useDriveStatus(bandId);
  const photo = useBandPhoto(bandId);
  const summary = bands.data?.find((b) => b.id === bandId);
  const name = detail.data?.name ?? summary?.name ?? "";
  const photoUrl = detail.data?.photoUrl ?? summary?.photoUrl ?? null;
  const ready = status.data?.folderSet === true;

  return (
    <PhotoUpload
      testId="band-photo-row"
      title="Band name and photo"
      hasPhoto={!!photoUrl}
      disabledNote={status.data && !ready ? NOT_LINKED_NOTE : null}
      loading={status.isPending}
      readOnly={summary ? summary.role !== "admin" : false}
      preview={
        <BandAvatar
          band={{ id: bandId, name, imageUrl: photoUrl }}
          className="size-16 text-xl"
        />
      }
      onUpload={(file) => photo.upload.mutateAsync(file)}
      onRemove={() => photo.remove.mutateAsync()}
    />
  );
}
