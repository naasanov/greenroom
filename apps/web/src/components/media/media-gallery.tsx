"use client";

import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  CheckCheck,
  ChevronDown,
  Download,
  ExternalLink,
  FolderInput,
  FolderPlus,
  Grid2x2,
  Grid3x3,
  List,
  MoreHorizontal,
  Music2,
  Pencil,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { MediaFolderWithItems, MediaItem } from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Fab } from "@/components/app/fab";
import {
  SegmentedToggle,
  type SegmentedOption,
} from "@/components/app/segmented-toggle";
import {
  SelectionBar,
  type SelectionAction,
} from "@/components/app/selection-bar";
import { DriveLinkPrompt } from "@/components/google/drive-link-prompt";
import { SongPickerDrawer } from "@/components/setlists/setlist-aside";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api";
import { useGoogleIntegrations } from "@/lib/queries/google";
import {
  orderedItems,
  useCreateMediaFolder,
  useDeleteMediaFolder,
  useGigMedia,
  useLinkMediaSong,
  useMoveMediaItems,
  useRenameMediaFolder,
  useRenameMediaItem,
  useReorderMediaFolders,
  useTrashMediaItems,
} from "@/lib/queries/media";
import { useGigSetlist, useSetlist } from "@/lib/queries/setlists";
import { useSongs } from "@/lib/queries/songs";
import { createLocalChoice } from "@/lib/use-local-choice";
import { cn } from "@/lib/utils";
import {
  downloadUrl,
  shareItems,
  startDownload,
  useShareSheet,
  zipUrl,
} from "./media-download";
import { MediaTile, type Density } from "./media-tile";
import { MediaViewer } from "./media-viewer";

const useDensity = createLocalChoice<Density>(
  "greenroom:media-density",
  ["large", "compact", "names"],
  "large",
);

const DENSITY_OPTIONS: SegmentedOption<Density>[] = [
  {
    value: "large",
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
  { value: "names", label: "Names only", icon: <List />, iconOnly: true },
];

const GRID: Record<Density, string> = {
  large:
    "grid grid-cols-2 gap-x-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  compact:
    "grid grid-cols-3 gap-x-2 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9",
  names: "flex flex-col",
};

interface Section {
  key: string;
  /** Null for Unsorted. */
  folder: MediaFolderWithItems | null;
  name: string;
  items: MediaItem[];
}

type FolderDialog =
  { kind: "new" } | { kind: "rename"; folderId: string; name: string };

function FolderNameDialog({
  state,
  onSubmit,
  onClose,
}: {
  state: FolderDialog | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(state);
  if (state && state !== shown) setShown(state);
  const [value, setValue] = useState("");
  const [prev, setPrev] = useState<FolderDialog | null>(null);
  if (state !== prev) {
    setPrev(state);
    if (state) setValue(state.kind === "rename" ? state.name : "");
  }
  const rename = shown?.kind === "rename";
  const trimmed = value.trim();
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {rename ? "Rename folder" : "New folder"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Folder name"
            placeholder="Folder name"
            maxLength={120}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed}>
              {rename ? "Rename" : "Create folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeader({
  section,
  index,
  count,
  collapsed,
  placing,
  folderCount,
  folderIndex,
  onToggle,
  onPlace,
  onJump,
  onRename,
  onMove,
  onDelete,
}: {
  section: Section;
  index: number;
  count: number;
  collapsed: boolean;
  placing: boolean;
  folderCount: number;
  folderIndex: number;
  onToggle: () => void;
  onPlace: () => void;
  onJump: (delta: number) => void;
  onRename: () => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const empty = section.items.length === 0;
  return (
    <header
      data-testid="media-section-header"
      className={cn(
        "flex items-center gap-1 rounded-2xl pr-1 pl-2",
        placing && "bg-primary/10 ring-2 ring-primary/60",
      )}
    >
      <button
        type="button"
        data-testid={placing ? "move-here" : "section-toggle"}
        aria-expanded={placing ? undefined : !collapsed}
        aria-label={
          placing
            ? `Move here: ${section.name}`
            : `${collapsed ? "Expand" : "Collapse"} ${section.name}`
        }
        onClick={placing ? onPlace : onToggle}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            collapsed && "-rotate-90",
          )}
        />
        <h2 className="truncate text-base font-semibold">{section.name}</h2>
        <span className="text-sm text-muted-foreground tabular-nums">
          {section.items.length}
        </span>
        {placing ? (
          <span className="ml-auto rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            Move here
          </span>
        ) : null}
      </button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Previous section from ${section.name}`}
        data-testid="section-up"
        disabled={index === 0}
        onClick={() => onJump(-1)}
      >
        <ArrowUp />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Next section from ${section.name}`}
        data-testid="section-down"
        disabled={index === count - 1}
        onClick={() => onJump(1)}
      >
        <ArrowDown />
      </Button>
      {section.folder ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Options for ${section.name}`}
              data-testid="folder-menu"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>
              <Pencil /> Rename folder
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={folderIndex === 0}
              onSelect={() => onMove(-1)}
            >
              <ArrowUp /> Move folder up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={folderIndex === folderCount - 1}
              onSelect={() => onMove(1)}
            >
              <ArrowDown /> Move folder down
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!empty}
              onSelect={onDelete}
            >
              <Trash2 /> {empty ? "Delete folder" : "Delete folder (not empty)"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
}

/**
 * Full-screen gallery of one gig's media. Upload hook point: `onAddMedia`
 * receives the files picked with the floating plus button (the upload tray
 * attaches here); without it the picker does nothing with the files.
 */
export function MediaGallery({
  bandId,
  gigId,
  gigTitle,
  onClose,
  onAddMedia,
}: {
  bandId: string;
  gigId: string;
  gigTitle?: string;
  onClose: () => void;
  onAddMedia?: (files: File[]) => void;
}) {
  const media = useGigMedia(bandId, gigId);
  const integrations = useGoogleIntegrations(bandId);
  const gigSetlist = useGigSetlist(bandId, gigId);
  const setlist = useSetlist(bandId, gigSetlist.data?.id);
  const songs = useSongs(bandId, { q: "", sort: "title" });
  const [density, setDensity] = useDensity();

  const move = useMoveMediaItems(bandId, gigId);
  const renameItem = useRenameMediaItem(bandId, gigId);
  const trash = useTrashMediaItems(bandId, gigId);
  const link = useLinkMediaSong(bandId, gigId);
  const createFolder = useCreateMediaFolder(bandId, gigId);
  const renameFolder = useRenameMediaFolder(bandId, gigId);
  const deleteFolder = useDeleteMediaFolder(bandId, gigId);
  const reorder = useReorderMediaFolders(bandId, gigId);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [picker, setPicker] = useState<string[] | null>(null);
  const [moveMenu, setMoveMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shareSheet = useShareSheet("touch");
  const fileInput = useRef<HTMLInputElement>(null);

  const data = media.data;
  const drive = integrations.data?.drive;
  const ready = !!data?.driveLinked && !!drive?.folderId;

  const folders = useMemo(
    () => [...(data?.folders ?? [])].sort((a, b) => a.position - b.position),
    [data?.folders],
  );
  const sections: Section[] = useMemo(() => {
    if (!data) return [];
    const out: Section[] = [];
    if (data.unsorted.length > 0 || folders.length === 0) {
      out.push({
        key: "unsorted",
        folder: null,
        name: "Unsorted",
        items: data.unsorted,
      });
    }
    for (const f of folders) {
      out.push({ key: f.id, folder: f, name: f.name, items: f.items });
    }
    return out;
  }, [data, folders]);
  const all = useMemo(() => (data ? orderedItems(data) : []), [data]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const selectedIds = all.filter((i) => selected.has(i.id)).map((i) => i.id);
  const selectedItems = selectedIds.flatMap((id) => byId.get(id) ?? []);
  const allSelected = all.length > 0 && selectedIds.length === all.length;
  const placing = selecting && selectedIds.length > 0;

  const songTitles = useMemo(
    () => new Map((songs.data ?? []).map((s) => [s.id, s.title])),
    [songs.data],
  );
  const songTitle = (i: MediaItem) =>
    i.songId ? (songTitles.get(i.songId) ?? null) : null;
  const setlistSongIds = useMemo(
    () => setlist.data?.items.map((i) => i.songId) ?? [],
    [setlist.data?.items],
  );

  const clearSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const startWith = (id: string) => {
    setSelecting(true);
    setSelected((prev) => new Set(prev).add(id));
  };

  const fail = (what: string) => ({ onError: () => setError(what) });

  function moveSelectionTo(folderId: string | null) {
    if (selectedIds.length === 0) return;
    move.mutate(
      { itemIds: selectedIds, folderId },
      fail("Could not move those items."),
    );
    setMoveMenu(false);
    clearSelection();
  }

  function jump(index: number, delta: number) {
    const target = sections[index + delta];
    if (!target) return;
    document
      .getElementById(`media-section-${target.key}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function moveFolder(folderId: string, delta: number) {
    const ids = folders.map((f) => f.id);
    const at = ids.indexOf(folderId);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= ids.length) return;
    [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    reorder.mutate({ ids }, fail("Could not reorder folders."));
  }

  function commitRename(item: MediaItem, name: string | null) {
    setEditingId(null);
    const next = name?.trim();
    if (!next || next === item.name) return;
    renameItem.mutate(
      { itemId: item.id, name: next },
      fail("Could not rename that item."),
    );
  }

  async function share(items: MediaItem[], fallbackToZip: boolean) {
    try {
      if (await shareItems(items)) return;
    } catch {
      // Falls through to the zip download below.
    }
    if (fallbackToZip) {
      startDownload(
        zipUrl(
          bandId,
          items.map((i) => i.id),
        ),
      );
    }
  }

  function download() {
    if (selectedItems.length === 1) {
      startDownload(downloadUrl(selectedItems[0]!), selectedItems[0]!.name);
    } else if (shareSheet) {
      void share(selectedItems, true);
    } else {
      startDownload(zipUrl(bandId, selectedIds));
    }
  }

  const actions: SelectionAction[] = [
    {
      key: "select-all",
      label: allSelected ? "Deselect all" : "Select all",
      icon: <CheckCheck />,
      onSelect: () =>
        setSelected(allSelected ? new Set() : new Set(all.map((i) => i.id))),
    },
    {
      key: "move",
      label: "Move to folder",
      icon: <FolderInput />,
      onSelect: () => setMoveMenu(true),
    },
    {
      key: "rename",
      label: "Rename",
      icon: <Pencil />,
      when: "single",
      onSelect: () => setEditingId(selectedIds[0] ?? null),
    },
    {
      key: "link-song",
      label: "Link to song",
      icon: <Music2 />,
      onSelect: () => setPicker(selectedIds),
    },
    {
      key: "download",
      label: "Download",
      icon: <Download />,
      onSelect: download,
    },
    ...(shareSheet
      ? [
          {
            key: "share",
            label: "Share",
            icon: <Share2 />,
            onSelect: () => void share(selectedItems, false),
          },
        ]
      : []),
    {
      key: "delete",
      label: "Delete",
      icon: <Trash2 />,
      destructive: true,
      onSelect: () => setConfirmDelete(selectedIds),
    },
  ];

  const viewerIndex = viewerId ? all.findIndex((i) => i.id === viewerId) : -1;

  function open(item: MediaItem) {
    if (selecting) toggle(item.id);
    else setViewerId(item.id);
  }

  const plural = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

  let body;
  if (!data || !drive) {
    body = null;
  } else if (!ready) {
    body = <DriveLinkPrompt bandId={bandId} />;
  } else {
    body = (
      <>
        {all.length === 0 ? (
          <p
            data-testid="media-empty"
            className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground"
          >
            No media yet
          </p>
        ) : null}
        {sections.map((section, index) => {
          if (section.items.length === 0 && !section.folder) return null;
          const isCollapsed = collapsed.has(section.key);
          const folderIndex = section.folder
            ? folders.findIndex((f) => f.id === section.folder!.id)
            : -1;
          return (
            <section
              key={section.key}
              id={`media-section-${section.key}`}
              data-testid="media-section"
              data-section={section.name}
              aria-label={section.name}
              className="scroll-mt-28 pt-6 first:pt-2"
            >
              <SectionHeader
                section={section}
                index={index}
                count={sections.length}
                collapsed={isCollapsed}
                placing={placing}
                folderCount={folders.length}
                folderIndex={folderIndex}
                onToggle={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(section.key)) next.add(section.key);
                    return next;
                  })
                }
                onPlace={() => moveSelectionTo(section.folder?.id ?? null)}
                onJump={(d) => jump(index, d)}
                onRename={() =>
                  setFolderDialog({
                    kind: "rename",
                    folderId: section.folder!.id,
                    name: section.name,
                  })
                }
                onMove={(d) => moveFolder(section.folder!.id, d)}
                onDelete={() =>
                  deleteFolder.mutate(
                    { folderId: section.folder!.id },
                    {
                      onError: (e) =>
                        setError(
                          isApiError(e, 409)
                            ? "That folder still has items."
                            : "Could not delete that folder.",
                        ),
                    },
                  )
                }
              />
              {isCollapsed ? null : section.items.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  Empty folder
                </p>
              ) : (
                <ul className={cn("mt-2", GRID[density])}>
                  {section.items.map((item) => (
                    <MediaTile
                      key={item.id}
                      item={item}
                      density={density}
                      selected={selected.has(item.id)}
                      selecting={selecting}
                      songTitle={songTitle(item)}
                      editing={editingId === item.id}
                      onActivate={() => open(item)}
                      onLongPress={() => startWith(item.id)}
                      onStartRename={() => setEditingId(item.id)}
                      onRename={(name) => commitRename(item, name)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        <div className="pt-8">
          <Button
            variant="outline"
            data-testid="new-folder"
            onClick={() => setFolderDialog({ kind: "new" })}
          >
            <FolderPlus /> New folder
          </Button>
        </div>
      </>
    );
  }

  return (
    <div
      data-testid="media-gallery"
      className="fixed inset-0 z-40 overflow-y-auto bg-background"
    >
      <div className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-1 px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to gig"
            data-testid="media-close"
            onClick={onClose}
          >
            <ArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base leading-tight font-semibold">
              Media
            </h1>
            {gigTitle ? (
              <p className="truncate text-xs text-muted-foreground">
                {gigTitle}
              </p>
            ) : null}
          </div>
          {data?.driveFolderUrl ? (
            <Button asChild variant="ghost" size="sm">
              <a
                href={data.driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                data-testid="open-in-drive"
              >
                <ExternalLink />{" "}
                <span className="hidden sm:inline">Open in </span>Drive
              </a>
            </Button>
          ) : null}
          {ready && all.length > 0 ? (
            selecting ? (
              <Button
                variant="secondary"
                size="sm"
                data-testid="select-cancel"
                onClick={clearSelection}
              >
                <X /> Cancel
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                data-testid="select-start"
                onClick={() => setSelecting(true)}
              >
                Select
              </Button>
            )
          ) : null}
        </div>
        {ready ? (
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 pb-2">
            <SegmentedToggle
              label="View density"
              value={density}
              onValueChange={setDensity}
              options={DENSITY_OPTIONS}
            />
            {selecting && selectedIds.length === 0 ? (
              <Button
                variant="outline"
                size="sm"
                data-testid="header-select-all"
                onClick={() => setSelected(new Set(all.map((i) => i.id)))}
              >
                <CheckCheck /> Select all
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <main data-density={density} className="mx-auto max-w-5xl px-3 pb-40">
        {error ? (
          <p
            role="alert"
            className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {error}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </p>
        ) : null}
        {body}
      </main>

      {ready && !selecting ? (
        <>
          {/* Upload tray hook point: replace the picker with the tray's add flow. */}
          <Fab
            label="Add media"
            layout="desktop"
            onClick={() => fileInput.current?.click()}
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            hidden
            data-testid="media-file-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) onAddMedia?.(files);
            }}
          />
        </>
      ) : null}

      <SelectionBar
        count={selecting ? selectedIds.length : 0}
        actions={actions}
        onClear={clearSelection}
        noun="selected"
        labels={false}
      />

      {viewerIndex >= 0 ? (
        <MediaViewer
          items={all}
          index={viewerIndex}
          songTitle={songTitle}
          onIndexChange={(i) => setViewerId(all[i]?.id ?? null)}
          onClose={() => setViewerId(null)}
          onLinkSong={(item) => setPicker([item.id])}
          onClearSong={(item) =>
            link.mutate(
              { itemIds: [item.id], songId: null },
              fail("Could not clear the song."),
            )
          }
        />
      ) : null}

      <BottomDrawer
        open={moveMenu}
        onOpenChange={setMoveMenu}
        title="Move to folder"
      >
        <ul className="flex flex-col gap-2">
          {[{ id: null, name: "Unsorted" }, ...folders].map((f) => (
            <li key={f.id ?? "unsorted"}>
              <Button
                variant="outline"
                className="h-12 w-full justify-start"
                aria-label={`Move to ${f.name}`}
                onClick={() => moveSelectionTo(f.id)}
              >
                <FolderInput /> {f.name}
              </Button>
            </li>
          ))}
        </ul>
      </BottomDrawer>

      <SongPickerDrawer
        bandId={bandId}
        open={!!picker}
        onOpenChange={(o) => !o && setPicker(null)}
        firstSongIds={setlistSongIds}
        currentSongId={
          picker?.length === 1 ? (byId.get(picker[0]!)?.songId ?? null) : null
        }
        onClear={() => {
          if (picker) {
            link.mutate(
              { itemIds: picker, songId: null },
              fail("Could not clear the song."),
            );
            clearSelection();
          }
        }}
        onPick={(song) => {
          if (picker) {
            link.mutate(
              { itemIds: picker, songId: song.id },
              fail("Could not link that song."),
            );
            clearSelection();
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete from Drive?"
        description={`Move ${plural(confirmDelete?.length ?? 0)} to Google Drive trash? You can restore them from Drive.`}
        confirmLabel="Move to trash"
        destructive
        onConfirm={() => {
          if (!confirmDelete) return;
          trash.mutate(
            { itemIds: confirmDelete },
            fail("Could not move those items to trash."),
          );
          setConfirmDelete(null);
          clearSelection();
        }}
      />

      <FolderNameDialog
        state={folderDialog}
        onClose={() => setFolderDialog(null)}
        onSubmit={(name) => {
          const d = folderDialog;
          setFolderDialog(null);
          if (d?.kind === "new") {
            createFolder.mutate(name, fail("Could not create that folder."));
          } else if (d) {
            renameFolder.mutate(
              { folderId: d.folderId, name },
              fail("Could not rename that folder."),
            );
          }
        }}
      />
    </div>
  );
}
