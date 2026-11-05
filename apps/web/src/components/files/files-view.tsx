"use client";

import {
  CheckSquare,
  FolderOpen,
  FolderPlus,
  Grid2x2,
  Grid3x3,
  List,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FileEntry } from "@greenroom/shared";
import { FILES_ERROR_CODES } from "@greenroom/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { Fab } from "@/components/app/fab";
import { SelectionBar } from "@/components/app/selection-bar";
import {
  SegmentedToggle,
  type SegmentedOption,
} from "@/components/app/segmented-toggle";
import { DriveLinkPrompt } from "@/components/google/drive-link-prompt";
import { openMediaView } from "@/components/media/media-gallery-page";
import { startDownload } from "@/components/media/media-download";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isApiError } from "@/lib/api";
import {
  filesContentUrl,
  useCreateFilesFolder,
  useFilesFolder,
  useRenameFile,
  useSetFileSongs,
  useTrashFiles,
} from "@/lib/queries/files";
import { useGoogleIntegrations } from "@/lib/queries/google";
import { createLocalChoice } from "@/lib/use-local-choice";
import { cn } from "@/lib/utils";
import { Breadcrumbs } from "./breadcrumbs";
import { FileRow, FileTile, type EntryProps } from "./file-entry";
import { FilesSkeleton } from "./files-skeleton";
import { FileViewer } from "./file-viewer";
import { entryHref, isProtected } from "./file-utils";
import type { EntryActions } from "./item-menu";
import { LinkSongsDrawer } from "./link-songs-drawer";
import { NameDialog, type NameDialogState } from "./name-dialog";
import { useFilesUpload } from "./use-files-upload";

/** "grid" is the large-previews grid; the value predates the compact option. */
type FilesViewMode = "list" | "grid" | "compact";

const useViewChoice = createLocalChoice<FilesViewMode>(
  "gr-files-view",
  ["list", "grid", "compact"],
  "list",
);

const VIEW_OPTIONS: SegmentedOption<FilesViewMode>[] = [
  { value: "list", label: "List", icon: <List />, iconOnly: true },
  {
    value: "grid",
    label: "Large previews",
    icon: <Grid2x2 />,
    iconOnly: true,
  },
  {
    value: "compact",
    label: "Compact previews",
    icon: <Grid3x3 />,
    iconOnly: true,
  },
];

const PROTECTED_HINT = "Delete the gig to remove its folder";

function Toast({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [text, onDismiss]);
  return (
    <div
      role="status"
      data-testid="files-toast"
      onClick={onDismiss}
      className="fixed inset-x-4 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+5rem)] z-40 mx-auto w-fit max-w-sm rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-lift md:bottom-6"
    >
      {text}
    </div>
  );
}

/** Folder browser: breadcrumbs, list or grid, and the New, rename, trash and song-link flows. */
export function FilesView({
  bandId,
  folderId,
}: {
  bandId: string;
  folderId: string;
}) {
  const router = useRouter();
  const integrations = useGoogleIntegrations(bandId);
  const drive = integrations.data?.drive;
  const driveReady = drive ? drive.linked && !!drive.folderId : undefined;
  const listing = useFilesFolder(bandId, folderId, driveReady !== false);
  const [view, setView] = useViewChoice();
  const upload = useFilesUpload(bandId);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const createFolder = useCreateFilesFolder(bandId);
  const rename = useRenameFile(bandId);
  const trash = useTrashFiles(bandId);
  const setSongs = useSetFileSongs(bandId);

  const [toast, setToast] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<FileEntry | null>(null);
  const [linkTarget, setLinkTarget] = useState<FileEntry | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [trashTargets, setTrashTargets] = useState<FileEntry[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const data = listing.data;
  const items = data?.items ?? [];

  const dropFolder = (e: React.DragEvent): string | null => {
    const hasFiles = Array.from(e.dataTransfer.types).includes("Files");
    if (!hasFiles || !data) return null;
    const row = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-drop-folder]",
    );
    return row?.dataset.dropFolder ?? folderId;
  };

  const toggle = (entry: FileEntry) => {
    if (isProtected(entry)) {
      setToast(PROTECTED_HINT);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(entry.id)) next.add(entry.id);
      return next;
    });
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const actions: EntryActions = {
    onOpen: (e) => {
      const href = entryHref(e);
      if (e.gig) openMediaView(router, e.gig.id);
      else if (href) router.push(href);
      else setViewer(e);
    },
    onRename: (e) => {
      setNameError(null);
      setNameDialog({ kind: "rename", fileId: e.id, name: e.name });
    },
    onDownload: (e) =>
      startDownload(filesContentUrl(bandId, e.id, true), e.name),
    onLinkSongs: (e) => {
      setLinkError(null);
      setLinkTarget(e);
    },
    onTrash: (e) => setTrashTargets([e]),
  };

  function submitName(name: string) {
    if (!nameDialog || !data) return;
    const done = {
      onSuccess: () => setNameDialog(null),
      onError: () => setNameError("Could not save that name."),
    };
    if (nameDialog.kind === "create") {
      createFolder.mutate({ parentId: data.folder.id, name }, done);
    } else {
      rename.mutate({ fileId: nameDialog.fileId, name }, done);
    }
  }

  function confirmTrash() {
    const ids = trashTargets.map((t) => t.id);
    trash.mutate(ids, {
      onSuccess: () => {
        stopSelecting();
        setToast(
          ids.length === 1 ? "Moved to trash" : `Moved ${ids.length} to trash`,
        );
      },
      onError: (e) =>
        setToast(
          isApiError(e, 409) && e.code === FILES_ERROR_CODES.gigFolderProtected
            ? PROTECTED_HINT
            : "Could not move to trash.",
        ),
    });
  }

  function newFolder() {
    setNameError(null);
    setNameDialog({ kind: "create" });
  }

  const unlinked = driveReady === false || isApiError(listing.error, 409);

  let body;
  if (unlinked) {
    body = <DriveLinkPrompt bandId={bandId} />;
  } else if (isApiError(listing.error, 404)) {
    body = (
      <EmptyState
        icon={FolderOpen}
        title="Folder not found"
        description="It may have been moved or deleted."
        action={
          <Button asChild variant="outline">
            <Link href="/files">Back to Files</Link>
          </Button>
        }
      />
    );
  } else if (listing.isError) {
    body = (
      <EmptyState
        icon={FolderOpen}
        title="Could not load files"
        description="Check your connection and try again."
        action={
          <Button variant="outline" onClick={() => void listing.refetch()}>
            Retry
          </Button>
        }
      />
    );
  } else if (!data) {
    body = <FilesSkeleton />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        icon={FolderOpen}
        title="This folder is empty"
        description="Create a folder or upload files to get started."
      />
    );
  } else {
    const rowProps = (entry: FileEntry): EntryProps => ({
      bandId,
      entry,
      selecting,
      selected: selected.has(entry.id),
      dropActive: dropTarget === entry.id,
      menuOpen: menuId === entry.id,
      onMenuOpenChange: (open) => setMenuId(open ? entry.id : null),
      onToggle: () => toggle(entry),
      onOpenFile: setViewer,
      actions,
    });
    body = (
      <>
        {view !== "list" ? (
          <ul
            data-testid="files-grid"
            data-density={view}
            className={cn(
              "grid",
              view === "compact"
                ? "grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9"
                : "grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
            )}
          >
            {items.map((e) => (
              <FileTile
                key={e.id}
                {...rowProps(e)}
                compact={view === "compact"}
              />
            ))}
          </ul>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div
              aria-hidden
              className="hidden grid-cols-[minmax(0,1fr)_minmax(0,14rem)_8rem_5rem_2.75rem] gap-x-3 border-b px-3 py-2 text-xs font-medium text-muted-foreground md:grid"
            >
              <span>Name</span>
              <span>Songs</span>
              <span>Modified</span>
              <span>Size</span>
              <span />
            </div>
            <ul data-testid="files-list">
              {items.map((e) => (
                <FileRow key={e.id} {...rowProps(e)} />
              ))}
            </ul>
          </div>
        )}
        {data.truncated ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Showing the first 1000 items.
          </p>
        ) : null}
      </>
    );
  }

  const canAct = !!data && !unlinked;
  const selectedEntries = items.filter((i) => selected.has(i.id));

  return (
    <div
      data-testid="files-tab"
      className="pb-28"
      onDragOver={(e) => {
        const target = dropFolder(e);
        if (target === null) return;
        e.preventDefault();
        setDropTarget(target);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDropTarget(null);
        }
      }}
      onDrop={(e) => {
        const target = dropFolder(e);
        setDropTarget(null);
        if (target === null) return;
        e.preventDefault();
        upload.startUpload(Array.from(e.dataTransfer.files), target);
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 md:p-4">
        <h1 className="sr-only">Files</h1>
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            {data ? <Breadcrumbs crumbs={data.breadcrumbs} /> : null}
          </div>
          {canAct ? (
            <div className="flex shrink-0 items-center">
              <SegmentedToggle
                label="View"
                value={view}
                onValueChange={setView}
                options={VIEW_OPTIONS}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Select items"
                aria-pressed={selecting}
                onClick={() =>
                  selecting ? stopSelecting() : setSelecting(true)
                }
                className={cn(
                  "text-muted-foreground",
                  selecting && "bg-gig-soft text-gig-soft-foreground",
                )}
              >
                <CheckSquare />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="ml-1 hidden md:inline-flex">
                    <Plus /> New
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={newFolder}>
                    <FolderPlus /> New folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => upload.openPicker(folderId)}
                  >
                    <Upload /> Upload files
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
        {upload.failed.length > 0 ? (
          <ul data-testid="files-upload-errors" className="flex flex-col gap-2">
            {upload.failed.map((f) => (
              <li
                key={f.key}
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {f.fileName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {f.error}
                  </span>
                </span>
                {f.retryable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Retry upload of ${f.fileName}`}
                    onClick={() => upload.retry(f.key)}
                  >
                    Retry
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Dismiss upload of ${f.fileName}`}
                  onClick={() => upload.discard(f.key)}
                >
                  Dismiss
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <div
          data-testid="files-drop-zone"
          data-dragging={dropTarget === folderId}
          className={cn(
            "rounded-2xl",
            dropTarget === folderId && "ring-2 ring-primary ring-offset-2",
          )}
        >
          {body}
        </div>
      </div>

      {canAct && !selecting ? (
        <Fab
          label="New"
          className="md:hidden"
          actions={[
            {
              key: "new-folder",
              label: "New folder",
              icon: <FolderPlus />,
              onSelect: newFolder,
            },
            {
              key: "upload",
              label: "Upload files",
              icon: <Upload />,
              onSelect: () => upload.openPicker(folderId),
            },
          ]}
        />
      ) : null}

      <SelectionBar
        count={selecting ? selected.size : 0}
        className="bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.75rem)] md:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        onClear={stopSelecting}
        actions={[
          {
            key: "trash",
            label: "Move to trash",
            icon: <Trash2 />,
            destructive: true,
            onSelect: () => setTrashTargets(selectedEntries),
          },
        ]}
      />

      <NameDialog
        state={nameDialog}
        pending={createFolder.isPending || rename.isPending}
        error={nameError}
        onSubmit={submitName}
        onClose={() => setNameDialog(null)}
      />
      <ConfirmDialog
        open={trashTargets.length > 0}
        onOpenChange={(o) => !o && setTrashTargets([])}
        title="Move to trash?"
        description={
          trashTargets.length === 1
            ? `"${trashTargets[0]!.name}" will move to the Google Drive trash, where it can be restored.`
            : `${trashTargets.length} items will move to the Google Drive trash, where they can be restored.`
        }
        confirmLabel="Move to trash"
        destructive
        onConfirm={confirmTrash}
      />
      <LinkSongsDrawer
        bandId={bandId}
        entry={linkTarget}
        saving={setSongs.isPending}
        error={linkError}
        onClose={() => setLinkTarget(null)}
        onSave={(songIds) =>
          setSongs.mutate(
            { fileId: linkTarget!.id, songIds },
            {
              onSuccess: () => setLinkTarget(null),
              onError: () => setLinkError("Could not save the song links."),
            },
          )
        }
      />
      {viewer ? (
        <FileViewer
          bandId={bandId}
          entry={viewer}
          onClose={() => setViewer(null)}
        />
      ) : null}
      {toast ? <Toast text={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
