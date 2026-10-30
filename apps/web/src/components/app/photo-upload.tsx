"use client";

import { Camera, Loader2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { photoErrorMessage, validatePhotoFile } from "@/lib/queries/photos";

const MAX_EDGE = 1024;

/** Reads the EXIF orientation (1-8) of a JPEG; 1 when absent or not a JPEG. */
async function exifOrientation(file: File): Promise<number> {
  try {
    const v = new DataView(await file.slice(0, 65536).arrayBuffer());
    if (v.getUint16(0) !== 0xffd8) return 1;
    let off = 2;
    while (off + 4 < v.byteLength) {
      const marker = v.getUint16(off);
      const len = v.getUint16(off + 2);
      if (marker === 0xffe1 && v.getUint32(off + 4) === 0x45786966) {
        const t = off + 10;
        const little = v.getUint16(t) === 0x4949;
        const ifd = t + v.getUint32(t + 4, little);
        const n = v.getUint16(ifd, little);
        for (let i = 0; i < n; i++) {
          const e = ifd + 2 + i * 12;
          if (v.getUint16(e, little) === 0x0112)
            return v.getUint16(e + 8, little);
        }
        return 1;
      }
      if ((marker & 0xff00) !== 0xff00) return 1;
      off += 2 + len;
    }
  } catch {
    // Unreadable metadata means no rotation.
  }
  return 1;
}

/** Decodes with EXIF rotation applied; manual rotation when the option is unsupported. */
async function decodeUpright(
  file: File,
): Promise<{ bitmap: ImageBitmap; applied: boolean }> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    // An <img> always shows EXIF-upright dimensions; a bitmap that disagrees ignored the option.
    const o = await exifOrientation(file);
    if (o < 5) return { bitmap, applied: true };
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const same =
        bitmap.width === img.naturalWidth &&
        bitmap.height === img.naturalHeight;
      return { bitmap, applied: same };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return { bitmap: await createImageBitmap(file), applied: false };
  }
}

/** Center-crops to an upright square JPEG; returns the original on any failure. */
async function squareCrop(file: File): Promise<File> {
  try {
    const { bitmap, applied } = await decodeUpright(file);
    const orientation = applied ? 1 : await exifOrientation(file);
    const swap = orientation >= 5;
    const width = swap ? bitmap.height : bitmap.width;
    const height = swap ? bitmap.width : bitmap.height;
    if (width === height && orientation === 1) return file;
    const side = Math.min(width, height);
    const out = Math.min(side, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // Draw into an upright intermediate, then crop the square from it.
    const upright = document.createElement("canvas");
    upright.width = width;
    upright.height = height;
    const uctx = upright.getContext("2d");
    if (!uctx) return file;
    const t: Record<number, [number, number, number, number, number, number]> =
      {
        2: [-1, 0, 0, 1, width, 0],
        3: [-1, 0, 0, -1, width, height],
        4: [1, 0, 0, -1, 0, height],
        5: [0, 1, 1, 0, 0, 0],
        6: [0, 1, -1, 0, width, 0],
        7: [0, -1, -1, 0, width, height],
        8: [0, -1, 1, 0, 0, height],
      };
    const m = t[orientation];
    if (m) uctx.setTransform(...m);
    uctx.drawImage(bitmap, 0, 0);
    ctx.drawImage(
      upright,
      (width - side) / 2,
      (height - side) / 2,
      side,
      side,
      0,
      0,
      out,
      out,
    );
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.9),
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/** Avatar preview with choose, replace, and remove actions, or a disabled note. */
export function PhotoUpload({
  testId,
  title,
  preview,
  hasPhoto,
  disabledNote,
  readOnly,
  loading,
  onUpload,
  onRemove,
}: {
  testId: string;
  title: string;
  preview: ReactNode;
  hasPhoto: boolean;
  /** When set, the row is disabled and shows this note. */
  disabledNote?: string | null;
  /** Hides the actions entirely (viewers who cannot change the photo). */
  readOnly?: boolean;
  /** Disables the actions while the setup state is still loading. */
  loading?: boolean;
  onUpload: (file: File) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = !!disabledNote || !!loading || busy;

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(photoErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function onPick(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    const problem = validatePhotoFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async () => onUpload(await squareCrop(file)));
  }

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <p className="text-sm font-medium">{title}</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative" aria-busy={busy}>
          {preview}
          {busy ? (
            <span
              role="status"
              aria-label="Uploading"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60"
            >
              <Loader2 className="size-5 animate-spin" />
            </span>
          ) : null}
        </div>
        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              id={inputId}
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid={`${testId}-input`}
              disabled={disabled}
              onChange={(e) => void onPick(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              <Camera /> {hasPhoto ? "Replace photo" : "Add photo"}
            </Button>
            {hasPhoto ? (
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={() => void run(onRemove)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {disabledNote ? (
        <p
          data-testid={`${testId}-note`}
          className="text-sm text-muted-foreground"
        >
          {disabledNote}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
