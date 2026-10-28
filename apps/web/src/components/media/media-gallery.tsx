"use client";

import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Ban,
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
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useMyUploads } from "@/lib/queries/uploads";
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
import { useGigUploads } from "./upload/upload-provider";
import { UploadTray } from "./upload/upload-tray";

const isTrayKey = (id: string) => id.startsWith("up-");
const ACCEPT = "image/*,video/*,audio/*,application/pdf";

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
 * Full-screen gallery of one gig's media. Picked or dropped files go to the
 * upload queue (shown in the tray); `onAddMedia` is also notified.
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
  const { store, entries, defaults } = useGigUploads(gigId);
  const mine = useMyUploads(bandId, gigId);
  const [trayHeight, setTrayHeight] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [bulkPicker, setBulkPicker] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (mine.data) store.restore(bandId, gigId, mine.data);
  }, [mine.data, store, bandId, gigId]);

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    store.add(bandId, gigId, files);
    onAddMedia?.(files);
  };
  const onTrayHeight = useCallback((px: number) => setTrayHeight(px), []);

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
  const trayKeys = entries.filter((e) => selected.has(e.key)).map((e) => e.key);
  const selectedCount = selectedIds.length + trayKeys.length;
  const trayScope =
    trayKeys.length > 0 || (selectedIds.length === 0 && entries.length > 0);
  const scopeIds = trayScope ? entries.map((e) => e.key) : all.map((i) => i.id);
  const scopeSelected = trayScope ? trayKeys.length : selectedIds.length;
  const allSelected = scopeIds.length > 0 && scopeSelected === scopeIds.length;
  const placing = selecting && selectedCount > 0;
  const trayOnly = trayKeys.length > 0 && selectedIds.length === 0;
  const galleryOnly = selectedIds.length > 0 && trayKeys.length === 0;
  const trayEntry = (key: string) => entries.find((e) => e.key === key);

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
  const toggleTray = (key: string) => {
    setSelecting(true);
    toggle(key);
  };
  const startWith = (id: string) => {
    setSelecting(true);
    setSelected((prev) => new Set(prev).add(id));
  };

  const fail = (what: string) => ({ onError: () => setError(what) });

  function moveSelectionTo(folderId: string | null) {
    if (selectedCount === 0) return;
    if (trayKeys.length > 0) store.patch(trayKeys, { folderId });
    if (selectedIds.length > 0) {
      move.mutate(
        { itemIds: selectedIds, folderId },
        fail("Could not move those items."),
      );
    }
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
      onSelect: () => setSelected(allSelected ? new Set() : new Set(scopeIds)),
    },
    ...(trayKeys.length > 0
      ? [
          {
            key: "cancel-upload",
            label: "Cancel upload",
            icon: <Ban />,
            destructive: true,
            onSelect: () => setConfirmCancel(trayKeys),
          },
        ]
      : []),
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
      onSelect: () => {
        if (trayOnly) setEditingKey(trayKeys[0] ?? null);
        else setEditingId(selectedIds[0] ?? null);
      },
    },
    {
      key: "link-song",
      label: "Link to song",
      icon: <Music2 />,
      onSelect: () => setPicker([...trayKeys, ...selectedIds]),
    },
    ...(!galleryOnly
      ? []
      : [
          {
            key: "download",
            label: "Download",
            icon: <Download />,
            onSelect: download,
          },
        ]),
    ...(shareSheet && galleryOnly
      ? [
          {
            key: "share",
            label: "Share",
            icon: <Share2 />,
            onSelect: () => void share(selectedItems, false),
          },
        ]
      : []),
    ...(galleryOnly
      ? [
          {
            key: "delete",
            label: "Delete",
            icon: <Trash2 />,
            destructive: true,
            onSelect: () => setConfirmDelete(selectedIds),
          },
        ]
      : []),
  ];

  const viewerIndex = viewerId ? all.findIndex((i) => i.id === viewerId) : -1;

  function open(item: MediaItem) {
    if (selecting) toggle(item.id);
    else setViewerId(item.id);
  }

  const plural = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

  function linkPicked(ids: string[], songId: string | null) {
    const keys = ids.filter(isTrayKey);
    const items = ids.filter((id) => !isTrayKey(id));
    if (keys.length > 0) store.patch(keys, { songId });
    if (items.length > 0) {
      link.mutate(
        { itemIds: items, songId },
        fail(
          songId ? "Could not link that song." : "Could not clear the song.",
        ),
      );
    }
  }

  let body;
  if (!data || !drive) {
    body = null;
  } else if (!ready) {
    body = <DriveLinkPrompt bandId={bandId} />;
  } else {
    body = (
      <>
        {all.length === 0 ? (
          <button
            type="button"
            data-testid="media-empty"
            onClick={() => fileInput.current?.click()}
            className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Upload className="size-5" />
            <span>No media yet</span>
            <span className="text-xs">Drop files here or tap to add</span>
          </button>
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
      style={{ "--tray-h": `${trayHeight}px` } as React.CSSProperties}
      onDragOver={(e) => {
        if (!ready || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!ready || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
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

      <main
        data-density={density}
        className="mx-auto max-w-5xl px-3 pb-[calc(10rem+var(--tray-h,0px))]"
      >
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

      {ready ? (
        <>
          {!selecting ? (
            <Fab
              label="Add media"
              layout="desktop"
              className="bottom-[calc(var(--tray-h,0px)+1.5rem)]"
              onClick={() => fileInput.current?.click()}
            />
          ) : null}
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            data-testid="media-file-input"
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </>
      ) : null}

      {ready && entries.length > 0 ? (
        <UploadTray
          entries={entries}
          folders={folders}
          defaults={defaults}
          selected={selected}
          editingKey={editingKey}
          songTitle={(id) => (id ? (songTitles.get(id) ?? null) : null)}
          onFolder={(folderId) => store.setDefaults(gigId, { folderId })}
          onPickSong={() => setBulkPicker(true)}
          onToggle={toggleTray}
          onStartRename={setEditingKey}
          onRename={(key, name) => {
            setEditingKey(null);
            const next = name?.trim();
            if (next && next !== trayEntry(key)?.fileName) {
              store.patch([key], { fileName: next });
            }
          }}
          onRetry={(key) => store.retry(key)}
          onCancelAll={() =>
            store.cancel(
              entries.filter((e) => e.status !== "done").map((e) => e.key),
            )
          }
          onDismissDone={() => store.dismiss(entries.map((e) => e.key))}
          onReadd={() => fileInput.current?.click()}
          onHeight={onTrayHeight}
        />
      ) : null}

      {dragging ? (
        <div
          data-testid="media-drop-overlay"
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 ring-4 ring-primary/60 ring-inset"
        >
          <p className="rounded-full bg-background px-5 py-3 text-sm font-medium shadow-lift">
            Drop files to upload
          </p>
        </div>
      ) : null}

      <SelectionBar
        count={selecting ? selectedCount : 0}
        actions={actions}
        onClear={clearSelection}
        noun="selected"
        labels={false}
        className="bottom-[calc(env(safe-area-inset-bottom)+var(--tray-h,0px)+0.75rem)]"
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
          picker?.length === 1
            ? isTrayKey(picker[0]!)
              ? (trayEntry(picker[0]!)?.songId ?? null)
              : (byId.get(picker[0]!)?.songId ?? null)
            : null
        }
        onClear={() => {
          if (picker) {
            linkPicked(picker, null);
            clearSelection();
          }
        }}
        onPick={(song) => {
          if (picker) {
            linkPicked(picker, song.id);
            clearSelection();
          }
        }}
      />

      <SongPickerDrawer
        bandId={bandId}
        open={bulkPicker}
        onOpenChange={setBulkPicker}
        title="Link uploads to a song"
        firstSongIds={setlistSongIds}
        currentSongId={defaults.songId}
        onClear={() => {
          store.setDefaults(gigId, { songId: null, songTitle: null });
          setBulkPicker(false);
        }}
        onPick={(song) => {
          store.setDefaults(gigId, { songId: song.id, songTitle: song.title });
          setBulkPicker(false);
        }}
      />

      <ConfirmDialog
        open={!!confirmCancel}
        onOpenChange={(o) => !o && setConfirmCancel(null)}
        title="Cancel these uploads?"
        description={`Stop ${plural(confirmCancel?.length ?? 0)} and discard what was sent so far?`}
        confirmLabel="Cancel uploads"
        destructive
        onConfirm={() => {
          if (confirmCancel) store.cancel(confirmCancel);
          setConfirmCancel(null);
          clearSelection();
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
