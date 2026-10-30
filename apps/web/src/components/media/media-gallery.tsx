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
  ListChecks,
  MoreHorizontal,
  Music2,
  Pencil,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
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
import type { UploadEntry } from "./upload/upload-store";
import { UploadTile } from "./upload/upload-tile";
import { UploadTray } from "./upload/upload-tray";

const isTrayKey = (id: string) => id.startsWith("up-");
/** Matches the `scroll-mt-28` on sections (7rem at the default font size). */
const SECTION_OFFSET = 112;
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
  /** Placed uploads still in flight (or awaiting their item), shown as tiles. */
  uploads: UploadEntry[];
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
  collapsed,
  placing,
  folderCount,
  folderIndex,
  onToggle,
  onPlace,
  onRename,
  onMove,
  onDelete,
}: {
  section: Section;
  collapsed: boolean;
  placing: boolean;
  folderCount: number;
  folderIndex: number;
  onToggle: () => void;
  onPlace: () => void;
  onRename: () => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
}) {
  const empty = section.items.length === 0;
  return (
    <header
      data-testid="media-section-header"
      className="flex items-center gap-1 rounded-2xl pr-1 pl-2"
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
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onSelect={onRename} className="whitespace-nowrap">
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={folderIndex === 0}
              onSelect={() => onMove(-1)}
              className="whitespace-nowrap"
            >
              <ArrowUp /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={folderIndex === folderCount - 1}
              onSelect={() => onMove(1)}
              className="whitespace-nowrap"
            >
              <ArrowDown /> Move down
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={!empty}
              onSelect={onDelete}
              className="whitespace-nowrap"
            >
              <Trash2 /> {empty ? "Delete" : "Delete (not empty)"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </header>
  );
}

/** A gallery section that highlights while tiles are dragged over it. */
function DropSection({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${section.key}` });
  return (
    <section
      ref={setNodeRef}
      id={`media-section-${section.key}`}
      data-testid="media-section"
      data-section={section.name}
      data-drop-over={isOver ? "true" : undefined}
      aria-label={section.name}
      className={cn(
        "scroll-mt-28 rounded-3xl pt-6 first:pt-2",
        isOver && "bg-primary/10 ring-2 ring-primary/60",
      )}
    >
      {children}
    </section>
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
  const { store, entries } = useGigUploads(gigId);
  const mine = useMyUploads(bandId, gigId);
  const [trayHeight, setTrayHeight] = useState(0);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [canJump, setCanJump] = useState({ up: false, down: false });
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
  );

  useEffect(() => {
    if (mine.data) store.restore(bandId, gigId, mine.data);
  }, [mine.data, store, bandId, gigId]);

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    store.add(bandId, gigId, files);
    onAddMedia?.(files);
  };
  const onTrayHeight = useCallback((px: number) => setTrayHeight(px), []);

  // Finished uploads waiting in the tray are shown there, not in the gallery.
  const trayItemIds = useMemo(
    () =>
      new Set(
        entries.flatMap((e) =>
          e.status === "done" && e.item && !e.placed ? [e.item.id] : [],
        ),
      ),
    [entries],
  );
  const data = useMemo(() => {
    const raw = media.data;
    if (!raw || trayItemIds.size === 0) return raw;
    const keep = (items: MediaItem[]) =>
      items.filter((i) => !trayItemIds.has(i.id));
    return {
      ...raw,
      unsorted: keep(raw.unsorted),
      folders: raw.folders.map((f) => ({ ...f, items: keep(f.items) })),
    };
  }, [media.data, trayItemIds]);
  const drive = integrations.data?.drive;
  const ready = !!data?.driveLinked && !!drive?.folderId;

  const folders = useMemo(
    () => [...(data?.folders ?? [])].sort((a, b) => a.position - b.position),
    [data?.folders],
  );
  // Uploads with a chosen folder render in that folder while they run, until
  // their media item shows up in the gallery data.
  const landedIds = useMemo(
    () =>
      new Set(
        media.data
          ? [
              ...media.data.unsorted,
              ...media.data.folders.flatMap((f) => f.items),
            ].map((i) => i.id)
          : [],
      ),
    [media.data],
  );
  const galleryUploads = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.placed &&
          (e.status === "queued" ||
            e.status === "uploading" ||
            e.status === "done") &&
          !(e.item && landedIds.has(e.item.id)),
      ),
    [entries, landedIds],
  );
  const galleryKeys = useMemo(
    () => new Set(galleryUploads.map((e) => e.key)),
    [galleryUploads],
  );
  const sections: Section[] = useMemo(() => {
    if (!data) return [];
    const out: Section[] = [];
    const uploadsIn = (id: string | null) =>
      galleryUploads.filter((e) => e.folderId === id);
    if (
      data.unsorted.length > 0 ||
      uploadsIn(null).length > 0 ||
      folders.length === 0
    ) {
      out.push({
        key: "unsorted",
        folder: null,
        name: "Unsorted",
        items: data.unsorted,
        uploads: uploadsIn(null),
      });
    }
    for (const f of folders) {
      out.push({
        key: f.id,
        folder: f,
        name: f.name,
        items: f.items,
        uploads: uploadsIn(f.id),
      });
    }
    return out;
  }, [data, folders, galleryUploads]);

  // Placed uploads whose item has landed in the gallery are done with the queue.
  useEffect(() => {
    const landed = entries.filter(
      (e) =>
        e.placed && e.status === "done" && e.item && landedIds.has(e.item.id),
    );
    if (landed.length > 0) store.dismiss(landed.map((e) => e.key));
  }, [entries, landedIds, store]);
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
    const doneEntries = trayKeys.flatMap((k) => {
      const e = trayEntry(k);
      return e?.status === "done" && e.item ? [e] : [];
    });
    const pendingKeys = trayKeys.filter((k) => trayEntry(k)?.status !== "done");
    if (pendingKeys.length > 0) store.patch(pendingKeys, { folderId });
    const itemIds = [...selectedIds, ...doneEntries.map((e) => e.item!.id)];
    if (itemIds.length > 0) {
      move.mutate({ itemIds, folderId }, fail("Could not move those items."));
    }
    // Finished uploads leave the tray once they are placed.
    if (doneEntries.length > 0) store.dismiss(doneEntries.map((e) => e.key));
    setMoveMenu(false);
    clearSelection();
  }

  /** Scroll offsets (px) that put each section header under the sticky bar. */
  function sectionTargets(): number[] {
    const el = root.current;
    if (!el) return [];
    const max = el.scrollHeight - el.clientHeight;
    return Array.from(el.querySelectorAll('[data-testid="media-section"]')).map(
      (n) => {
        const top =
          n.getBoundingClientRect().top - el.getBoundingClientRect().top;
        return Math.min(max, Math.max(0, top + el.scrollTop - SECTION_OFFSET));
      },
    );
  }

  const measureJump = useCallback(() => {
    const el = root.current;
    if (!el) return;
    const targets = sectionTargets();
    const next = {
      up: targets.some((t) => t < el.scrollTop - 4),
      down: targets.some((t) => t > el.scrollTop + 4),
    };
    setCanJump((prev) =>
      prev.up === next.up && prev.down === next.down ? prev : next,
    );
  }, []);

  // Jumps to the nearest section above or below the current scroll position.
  function jump(dir: 1 | -1) {
    const el = root.current;
    if (!el) return;
    const targets = sectionTargets();
    const top =
      dir === 1
        ? targets.find((t) => t > el.scrollTop + 4)
        : targets.findLast((t) => t < el.scrollTop - 4);
    if (top !== undefined) el.scrollTo({ top, behavior: "smooth" });
  }

  useEffect(() => {
    const id = requestAnimationFrame(measureJump);
    return () => cancelAnimationFrame(id);
  }, [measureJump, sections, collapsed, density, entries.length]);

  function dropOnSection(e: DragEndEvent) {
    setDragId(null);
    const key = String(e.over?.id ?? "");
    if (!key.startsWith("drop:")) return;
    const target = sections.find((x) => `drop:${x.key}` === key);
    if (!target) return;
    const dragged = String(e.active.id);
    const ids = selected.has(dragged) ? selectedIds : [dragged];
    const itemIds = ids.filter((id) => !target.items.some((i) => i.id === id));
    if (itemIds.length === 0) return;
    move.mutate(
      { itemIds, folderId: target.folder?.id ?? null },
      fail("Could not move those items."),
    );
    clearSelection();
  }

  function commitTrayRename(key: string, name: string | null) {
    setEditingKey(null);
    const next = name?.trim();
    const entry = trayEntry(key);
    if (!next || !entry || next === entry.fileName) return;
    if (entry.status === "done" && entry.item) {
      renameItem.mutate(
        { itemId: entry.item.id, name: next },
        fail("Could not rename that item."),
      );
      store.patchDone([key], { fileName: next });
    } else {
      store.patch([key], { fileName: next });
    }
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
    ...(trayKeys.some((k) => trayEntry(k)?.status !== "done")
      ? [
          {
            key: "cancel-upload",
            label: "Cancel upload",
            icon: <Ban />,
            destructive: true,
            onSelect: () =>
              setConfirmCancel(
                trayKeys.filter((k) => trayEntry(k)?.status !== "done"),
              ),
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
    const doneEntries = keys.flatMap((k) => {
      const e = trayEntry(k);
      return e?.status === "done" && e.item ? [e] : [];
    });
    const items = [
      ...ids.filter((id) => !isTrayKey(id)),
      ...doneEntries.map((e) => e.item!.id),
    ];
    const pending = keys.filter((k) => trayEntry(k)?.status !== "done");
    if (pending.length > 0) store.patch(pending, { songId });
    if (doneEntries.length > 0) {
      store.patchDone(
        doneEntries.map((e) => e.key),
        { songId },
      );
    }
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
        {all.length === 0 && entries.length === 0 ? (
          <div className="flex justify-center py-12">
            <Button
              size="lg"
              data-testid="media-empty"
              onClick={() => fileInput.current?.click()}
              className="h-20 gap-3 rounded-3xl px-10 text-lg"
            >
              <Upload className="size-6" /> Upload photos and videos
            </Button>
          </div>
        ) : null}
        {sections.map((section) => {
          if (
            section.items.length === 0 &&
            section.uploads.length === 0 &&
            !section.folder
          ) {
            return null;
          }
          const isCollapsed = collapsed.has(section.key);
          const folderIndex = section.folder
            ? folders.findIndex((f) => f.id === section.folder!.id)
            : -1;
          return (
            <DropSection key={section.key} section={section}>
              <SectionHeader
                section={section}
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
              {isCollapsed ? null : section.items.length === 0 &&
                section.uploads.length === 0 ? (
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
                      dragCount={selected.has(item.id) ? selectedIds.length : 1}
                    />
                  ))}
                  {section.uploads.map((e) => (
                    <UploadTile
                      key={e.key}
                      entry={e}
                      fill={density !== "names"}
                      selected={selected.has(e.key)}
                      editing={editingKey === e.key}
                      songTitle={
                        e.songId ? (songTitles.get(e.songId) ?? null) : null
                      }
                      onToggle={() => toggleTray(e.key)}
                      onStartRename={() => setEditingKey(e.key)}
                      onRename={(name) => commitTrayRename(e.key, name)}
                      onRetry={() => store.retry(e.key)}
                    />
                  ))}
                </ul>
              )}
            </DropSection>
          );
        })}
      </>
    );
  }

  return (
    <div
      ref={root}
      data-testid="media-gallery"
      onScroll={measureJump}
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
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(e) => setDragId(String(e.active.id))}
          onDragEnd={dropOnSection}
          onDragCancel={() => setDragId(null)}
        >
          {body}
          <DragOverlay dropAnimation={null} zIndex={60}>
            {dragId ? (
              <div
                data-testid="drag-overlay"
                className="w-fit rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lift"
              >
                {plural(selected.has(dragId) ? selectedIds.length : 1)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      {ready ? (
        <>
          {!selecting ? (
            <Fab
              label="Add media"
              layout="desktop"
              className="bottom-[calc(var(--tray-h,0px)+1.5rem)]"
              actions={[
                {
                  key: "upload",
                  label: "Upload",
                  icon: <Upload />,
                  onSelect: () => fileInput.current?.click(),
                },
                {
                  key: "new-folder",
                  label: "New folder",
                  icon: <FolderPlus />,
                  onSelect: () => setFolderDialog({ kind: "new" }),
                },
              ]}
            />
          ) : null}
          <div
            data-testid="fab-stack"
            className="pr-safe fixed right-4 bottom-[calc(var(--tray-h,0px)+5.75rem)] z-30 flex w-14 flex-col items-center gap-2"
          >
            {sections.length > 1 ? (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Jump to previous folder"
                  data-testid="jump-up"
                  disabled={!canJump.up}
                  onClick={() => jump(-1)}
                  className="size-11 rounded-full shadow-lift ring-1 ring-foreground/10"
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Jump to next folder"
                  data-testid="jump-down"
                  disabled={!canJump.down}
                  onClick={() => jump(1)}
                  className="size-11 rounded-full shadow-lift ring-1 ring-foreground/10"
                >
                  <ArrowDown />
                </Button>
              </>
            ) : null}
            {all.length > 0 || entries.length > 0 ? (
              <Button
                variant={selecting ? "default" : "secondary"}
                size="icon"
                aria-label={selecting ? "Exit selection mode" : "Select items"}
                aria-pressed={selecting}
                data-testid="select-fab"
                onClick={() =>
                  selecting ? clearSelection() : setSelecting(true)
                }
                className="size-12 rounded-full shadow-lift ring-1 ring-foreground/10"
              >
                {selecting ? <X /> : <ListChecks />}
              </Button>
            ) : null}
          </div>
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
          hiddenKeys={galleryKeys}
          selected={selected}
          editingKey={editingKey}
          songTitle={(id) => (id ? (songTitles.get(id) ?? null) : null)}
          onSelectAll={() => {
            setSelecting(true);
            setSelected(new Set(entries.map((e) => e.key)));
          }}
          onToggle={toggleTray}
          onStartRename={setEditingKey}
          onRename={commitTrayRename}
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
          onRename={(item, name) =>
            renameItem.mutate(
              { itemId: item.id, name },
              fail("Could not rename that item."),
            )
          }
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
