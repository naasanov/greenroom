"use client";

import { Camera, Loader2 } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { photoErrorMessage, validatePhotoFile } from "@/lib/queries/photos";

const MAX_EDGE = 1024;

/** Center-crops non-square images to a square JPEG; returns the original on any failure. */
async function squareCrop(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (width === height) return file;
    const side = Math.min(width, height);
    const out = Math.min(side, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(
      bitmap,
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
