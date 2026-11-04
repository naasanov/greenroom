"use client";

import { Download, File as FileIcon, Folder, Plus, Unlink } from "lucide-react";
import { useState } from "react";
import type { SongFile } from "@greenroom/shared";
import { FolderPickerDialog } from "@/components/google/folder-picker-dialog";
import { Button } from "@/components/ui/button";
import {
  fileContentUrl,
  useSetFileSongs,
  useSongFiles,
  useUnlinkSongFile,
} from "@/lib/queries/drive-browse";

function FileRow({
  bandId,
  file,
  busy,
  onUnlink,
}: {
  bandId: string;
  file: SongFile;
  busy: boolean;
  onUnlink: () => void;
}) {
  const Icon = file.isFolder ? Folder : FileIcon;
  const muted = !file.available;
  return (
    <li
      data-testid="song-file"
      data-name={file.name}
      data-available={file.available ? "true" : "false"}
      className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm"
    >
      <Icon
        className={`size-4 shrink-0 ${muted ? "text-muted-foreground/60" : "text-muted-foreground"}`}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {file.available && !file.isFolder ? (
          <a
            href={fileContentUrl(bandId, file.driveFileId)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open ${file.name}`}
            className="truncate font-medium hover:underline"
          >
            {file.name}
          </a>
        ) : (
          <span
            className={`truncate font-medium ${muted ? "text-muted-foreground" : ""}`}
          >
            {file.name}
          </span>
        )}
        {muted ? (
          <span className="text-xs text-muted-foreground">
            File unavailable
          </span>
        ) : file.gig ? (
          <span className="truncate text-xs text-muted-foreground">
            {file.gig.title}
          </span>
        ) : null}
      </div>
      {file.available && !file.isFolder ? (
        <Button variant="ghost" size="icon-sm" asChild>
          <a
            href={fileContentUrl(bandId, file.driveFileId, true)}
            aria-label={`Download ${file.name}`}
          >
            <Download />
          </a>
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Unlink ${file.name}`}
        disabled={busy}
        onClick={onUnlink}
      >
        <Unlink />
      </Button>
    </li>
  );
}

/** Drive files and folders linked to the song, with unlink and an add picker. */
export function SongFiles({
  bandId,
  songId,
}: {
  bandId: string;
  songId: string;
}) {
  const files = useSongFiles(bandId, songId);
  const setSongs = useSetFileSongs(bandId, songId);
  const unlinkFile = useUnlinkSongFile(bandId, songId);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function unlink(file: SongFile) {
    setError(null);
    unlinkFile.mutate(file.driveFileId, {
      onError: () => setError("Could not unlink that file. Please try again."),
    });
  }

  const list = files.data ?? [];
  return (
    <section className="flex flex-col gap-1.5" data-testid="song-files">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Files</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setError(null);
            setAdding(true);
          }}
        >
          <Plus />
          Add file
        </Button>
      </div>
      {files.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load files.
        </p>
      ) : list.length === 0 && !files.isPending ? (
        <p className="text-sm text-muted-foreground">No files linked.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((f) => (
            <FileRow
              key={f.id}
              bandId={bandId}
              file={f}
              busy={setSongs.isPending || unlinkFile.isPending}
              onUnlink={() => unlink(f)}
            />
          ))}
        </ul>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <FolderPickerDialog
        bandId={bandId}
        open={adding}
        onOpenChange={setAdding}
        mode="any"
        title="Add a file or folder"
        description="Pick a file or folder from your band's Drive to link to this song."
        pending={setSongs.isPending}
        error={error}
        onSelect={(id, _name, entry) => {
          setError(null);
          const existing = entry?.songLinks.map((l) => l.songId) ?? [];
          setSongs.mutate(
            {
              fileId: id,
              songIds: [...new Set([...existing, songId])],
            },
            {
              onSuccess: () => setAdding(false),
              onError: () =>
                setError("Could not link that file. Please try again."),
            },
          );
        }}
      />
    </section>
  );
}
