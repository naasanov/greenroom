"use client";

import { Loader2, Music2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  MediaItem,
  SongCandidate,
  SongCreated,
  SongDetail,
  SongSummary,
  SuggestedReference,
} from "@greenroom/shared";
import {
  ConfirmDialog,
  DiscardChangesDialog,
} from "@/components/app/confirm-dialogs";
import { LinkList } from "@/components/app/link-list";
import { Thumbnail } from "@/components/app/list-card";
import { RightSheet } from "@/components/app/right-sheet";
import { ShareButton } from "@/components/app/share-button";
import { MediaThumb, isVideo } from "@/components/media/media-tile";
import { MediaViewer } from "@/components/media/media-viewer";
import { Button } from "@/components/ui/button";
import { useSongMedia } from "@/lib/queries/uploads";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  DuplicateSongError,
  useCreateSong,
  useDeleteSong,
  usePrefetchSong,
  useSongDetail,
  useSongSummary,
  useUpdateSong,
} from "@/lib/queries/songs";
import { SmartInput } from "./smart-input";
import { SongForm } from "./song-form";
import {
  formatDuration,
  songArt,
  toSongBody,
  type SongFormValues,
} from "./song-utils";

export type SheetTarget =
  { kind: "song"; id: string } | { kind: "add"; nonce: number };

interface Draft {
  values: SongFormValues;
  meta: {
    imageUrl: string | null;
    spotifyTrackId: string | null;
    youtubeUrl: string | null;
  };
}

const EMPTY_META: Draft["meta"] = {
  imageUrl: null,
  spotifyTrackId: null,
  youtubeUrl: null,
};

const rowId = () => `row-${crypto.randomUUID()}`;

function draftFromCandidate(c: SongCandidate): Draft {
  return {
    values: {
      title: c.title,
      artist: c.artist ?? "",
      duration: formatDuration(c.durationSeconds) ?? "",
      notes: "",
      references: c.references.map((r) => ({ id: rowId(), ...r })),
    },
    meta: {
      imageUrl: c.imageUrl,
      spotifyTrackId: c.spotifyTrackId,
      youtubeUrl: c.youtubeUrl,
    },
  };
}

function valuesFromSong(song: SongDetail): SongFormValues {
  return {
    title: song.title,
    artist: song.artist ?? "",
    duration: formatDuration(song.durationSeconds) ?? "",
    notes: song.notes ?? "",
    references: song.references.map((r) => ({
      id: r.id,
      label: r.label,
      value: r.value,
    })),
  };
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium">{label}</h3>
      {children}
    </section>
  );
}

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** Videos linked to the song across gigs grouped by gig, then linked photos; hidden when empty. */
function SongVideos({
  bandId,
  songId,
  songTitle,
}: {
  bandId: string;
  songId: string;
  songTitle: string;
}) {
  const media = useSongMedia(bandId, songId);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const groups = media.data;
  const { sections, flat } = useMemo(() => {
    const build = (pick: (i: MediaItem) => boolean) =>
      (groups ?? []).flatMap((g) => {
        const items = g.items.filter(pick);
        return items.length > 0 ? [{ gig: g.gig, items }] : [];
      });
    const videos = build((i) => isVideo(i));
    const photos = build(
      (i) => !isVideo(i) && !!i.mimeType?.startsWith("image/"),
    );
    return {
      sections: [
        { key: "videos", label: null, groups: videos },
        { key: "photos", label: "Photos", groups: photos },
      ].filter((s) => s.groups.length > 0),
      flat: [...videos, ...photos].flatMap((g) => g.items),
    };
  }, [groups]);
  if (flat.length === 0) return null;
  const viewerIndex = viewerId ? flat.findIndex((i) => i.id === viewerId) : -1;
  return (
    <Section label="Videos">
      <div data-testid="song-videos" className="flex flex-col gap-3">
        {sections.map((sec) => (
          <div key={sec.key} className="flex flex-col gap-3">
            {sec.label ? (
              <p className="text-xs font-medium text-muted-foreground">
                {sec.label}
              </p>
            ) : null}
            {sec.groups.map((g) => (
              <div
                key={g.gig.id}
                data-testid="song-video-group"
                data-gig={g.gig.title}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <Link
                    href={`/gigs/${g.gig.id}`}
                    className="min-w-0 truncate font-medium hover:underline"
                  >
                    {g.gig.title}
                  </Link>
                  <span className="shrink-0 text-muted-foreground">
                    {dayLabel(g.gig.date)}
                  </span>
                </div>
                <ul className="grid grid-cols-3 gap-2">
                  {g.items.map((item) => (
                    <li key={item.id} className="min-w-0">
                      <button
                        type="button"
                        data-testid="song-video"
                        data-name={item.name}
                        aria-label={`Open ${item.name}`}
                        onClick={() => setViewerId(item.id)}
                        className="block aspect-square w-full overflow-hidden rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <MediaThumb item={item} compact />
                      </button>
                      <p className="truncate pt-0.5 text-xs">{item.name}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </div>
      {viewerIndex >= 0
        ? createPortal(
            <MediaViewer
              items={flat}
              index={viewerIndex}
              songTitle={() => songTitle}
              onIndexChange={(i) => setViewerId(flat[i]?.id ?? null)}
              onClose={() => setViewerId(null)}
            />,
            document.body,
          )
        : null}
    </Section>
  );
}

function DetailSkeleton({ error }: { error: boolean }) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load the rest of this song.
      </p>
    );
  }
  return (
    <div
      data-testid="song-detail-skeleton"
      aria-busy="true"
      className="flex flex-col gap-5"
    >
      {["Reference", "Notes", "Used in"].map((label) => (
        <Section key={label} label={label}>
          <div className="h-10 animate-pulse rounded-xl bg-muted" />
        </Section>
      ))}
    </div>
  );
}

/** Renders the summary fields at once; detail-only sections fill in later. */
function SongView({
  bandId,
  song,
  detail,
  detailError,
}: {
  bandId: string;
  song: SongSummary;
  detail: SongDetail | undefined;
  detailError: boolean;
}) {
  const duration = formatDuration(song.durationSeconds);
  return (
    <div className="flex flex-col gap-5" data-testid="song-view">
      <div className="flex items-start gap-3">
        <Thumbnail
          src={songArt(song)}
          seed={song.title}
          className="size-16"
          icon={<Music2 className="size-7 opacity-70" />}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-base font-semibold break-words">{song.title}</p>
          <p className="text-sm text-muted-foreground">
            {song.artist ?? "No artist"}
          </p>
        </div>
      </div>
      <Section label="Duration">
        <p className="text-sm">{duration ?? "Not set"}</p>
      </Section>
      {detail ? (
        <>
          <Section label="Reference">
            <LinkList
              rows={detail.references.map((r) => ({
                id: r.id,
                label: r.label,
                value: r.value,
              }))}
            />
          </Section>
          <Section label="Notes">
            {detail.notes ? (
              <p className="text-sm whitespace-pre-wrap">{detail.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No notes.</p>
            )}
          </Section>
          <Section label="Used in">
            {detail.usedIn.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Not in any setlist yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5" data-testid="used-in">
                {detail.usedIn.map((u) => (
                  <li
                    key={
                      u.setlistId + (u.kind === "gig" ? u.gigId : u.seriesId)
                    }
                    className="flex items-baseline justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-sm"
                  >
                    {u.kind === "gig" ? (
                      <>
                        <Link
                          href={`/gigs/${u.gigId}`}
                          className="min-w-0 truncate font-medium hover:underline"
                        >
                          {u.title}
                        </Link>
                        <span className="shrink-0 text-muted-foreground">
                          {dayLabel(u.date)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 truncate font-medium">
                          {u.title}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          Practice
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {detail.lastPlayedDate ? (
              <p className="text-xs text-muted-foreground">
                Last played {dayLabel(detail.lastPlayedDate)}
              </p>
            ) : null}
          </Section>
          <SongVideos bandId={bandId} songId={song.id} songTitle={song.title} />
        </>
      ) : (
        <DetailSkeleton error={detailError} />
      )}
    </div>
  );
}

/**
 * The right-hand song sheet: view, in-place edit, and the add flow (smart
 * input first, then the prefilled form).
 */
export function SongSheet({
  bandId,
  target,
  open,
  siblings,
  onSelect,
  onRequestClose,
  onCreated,
  onDeleted,
  onImport,
  onDirtyChange,
  initialText,
}: {
  bandId: string;
  target: SheetTarget;
  open: boolean;
  /** Ids in the current list order, for the previous/next arrows. */
  siblings: string[];
  onSelect: (id: string) => void;
  onRequestClose: () => void;
  onCreated: (song: SongCreated) => void;
  onDeleted: () => void;
  /** Omit where playlist import is not available; the hint points to the library. */
  onImport?: (url: string) => void;
  onDirtyChange: (dirty: boolean) => void;
  /** Prefills the add flow's smart input. */
  initialText?: string;
}) {
  const adding = target.kind === "add";
  const songId = target.kind === "song" ? target.id : null;
  const desktop = useMediaQuery("(min-width: 768px)");

  const resetKey = target.kind === "add" ? `add-${target.nonce}` : target.id;
  const [prevKey, setPrevKey] = useState(resetKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [typed, setTyped] = useState("");
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [pending, setPending] = useState<SongFormValues | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [offer, setOffer] = useState<{
    songId: string;
    ref: SuggestedReference;
  } | null>(null);
  const [dismissedTab, setDismissedTab] = useState<string | null>(null);
  if (resetKey !== prevKey) {
    setPrevKey(resetKey);
    setEditing(false);
    setDraft(null);
    setTyped("");
    setDuplicateId(null);
    setPending(null);
    setDirty(false);
  }

  const handleDirty = useCallback(
    (d: boolean) => {
      setDirty(d);
      onDirtyChange(d);
    },
    [onDirtyChange],
  );

  const detail = useSongDetail(bandId, songId);
  const song = detail.data;
  const summary = useSongSummary(bandId, songId);
  const prefetch = usePrefetchSong(bandId);
  const shown: SongSummary | undefined = song ?? summary;
  const create = useCreateSong(bandId);
  const update = useUpdateSong(bandId, songId ?? "");
  const remove = useDeleteSong(bandId);

  function submitCreate(values: SongFormValues, force: boolean) {
    if (!draft) return;
    setPending(values);
    setDuplicateId(null);
    create.mutate(
      { ...toSongBody(values), ...draft.meta, ...(force ? { force } : {}) },
      {
        onSuccess: (created) => {
          handleDirty(false);
          const ref = created.suggestedReference;
          if (
            ref &&
            ref.value !== dismissedTab &&
            !created.references.some((r) => r.value === ref.value)
          ) {
            setOffer({ songId: created.id, ref });
          }
          onCreated(created);
        },
        onError: (e) => {
          if (e instanceof DuplicateSongError) setDuplicateId(e.songId);
        },
      },
    );
  }

  function submitEdit(values: SongFormValues) {
    update.mutate(toSongBody(values), {
      onSuccess: () => {
        handleDirty(false);
        setEditing(false);
      },
    });
  }

  function changeEditing(next: boolean) {
    if (!next && dirty) setConfirmDiscard(true);
    else {
      if (!next) handleDirty(false);
      setEditing(next);
    }
  }

  function addOfferedTab() {
    if (!song || !offer) return;
    update.mutate(
      {
        references: [
          ...song.references.map(({ label, value }) => ({ label, value })),
          offer.ref,
        ],
      },
      { onSuccess: () => setOffer(null) },
    );
  }

  const index = songId ? siblings.indexOf(songId) : -1;
  const prevId = index > 0 ? siblings[index - 1] : undefined;
  const nextId = index >= 0 ? siblings[index + 1] : undefined;
  useEffect(() => {
    if (!open) return;
    if (prevId) prefetch(prevId);
    if (nextId) prefetch(nextId);
  }, [open, prevId, nextId, prefetch]);
  const showNav = !adding && !editing && !desktop && index >= 0;
  const formId = adding ? "add-song-form" : "edit-song-form";
  const showForm = adding ? draft !== null : editing && !!song;
  const saving = create.isPending || update.isPending;

  const title = adding ? "Add song" : (shown?.title ?? "Song");
  const subtitle = adding ? undefined : (shown?.artist ?? undefined);

  let body: React.ReactNode;
  if (adding && !draft) {
    body = (
      <SmartInput
        bandId={bandId}
        initialText={initialText}
        onPick={(c) => setDraft(draftFromCandidate(c))}
        onManual={(text) => {
          setTyped(text);
          setDraft({
            values: {
              title: text,
              artist: "",
              duration: "",
              notes: "",
              references: [],
            },
            meta: EMPTY_META,
          });
        }}
        onPlaylist={onImport}
        onOpenExisting={onSelect}
      />
    );
  } else if (adding && draft) {
    body = (
      <SongForm
        key={`${resetKey}-${draft.meta.spotifyTrackId ?? draft.meta.youtubeUrl ?? typed}`}
        formId={formId}
        bandId={bandId}
        defaults={draft.values}
        art={draft.meta.imageUrl}
        suggestTab
        onSubmit={(v) => submitCreate(v, false)}
        onDirtyChange={handleDirty}
        onDismissTab={setDismissedTab}
        notice={
          duplicateId ? (
            <div
              role="alert"
              data-testid="duplicate-notice"
              className="flex flex-col gap-2 rounded-2xl bg-destructive/10 p-3 text-sm"
            >
              <p className="font-medium">
                This song is already in your library.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onSelect(duplicateId)}
                >
                  Open it
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => pending && submitCreate(pending, true)}
                >
                  Add anyway
                </Button>
              </div>
            </div>
          ) : create.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not save the song. Please try again.
            </p>
          ) : null
        }
      />
    );
  } else if (!shown) {
    body = detail.isError ? (
      <p role="alert" className="text-sm text-destructive">
        Could not load this song.
      </p>
    ) : (
      <div className="flex justify-center py-10">
        <Loader2
          aria-label="Loading"
          className="size-6 animate-spin text-muted-foreground"
        />
      </div>
    );
  } else if (editing && song) {
    body = (
      <SongForm
        key={`${song.id}-${song.updatedAt}`}
        formId={formId}
        bandId={bandId}
        defaults={valuesFromSong(song)}
        art={songArt(song)}
        suggestTab={false}
        onSubmit={submitEdit}
        onDirtyChange={handleDirty}
        notice={
          update.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Could not save your changes. Please try again.
            </p>
          ) : null
        }
      >
        <Button
          type="button"
          variant="destructive"
          className="self-start"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 /> Delete song
        </Button>
      </SongForm>
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        {song && offer && offer.songId === song.id ? (
          <div
            data-testid="songsterr-offer"
            className="flex items-center gap-2 rounded-2xl bg-gig-soft px-3 py-2 text-sm text-gig-soft-foreground"
          >
            <span className="flex-1">Found a tab on Songsterr. Add it?</span>
            <Button type="button" size="sm" onClick={addOfferedTab}>
              Add tab
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOffer(null)}
            >
              No thanks
            </Button>
          </div>
        ) : null}
        <SongView
          bandId={bandId}
          song={shown}
          detail={song}
          detailError={detail.isError}
        />
      </div>
    );
  }

  const count = song?.setlistCount ?? 0;

  return (
    <>
      <RightSheet
        open={open}
        onOpenChange={(o) => !o && onRequestClose()}
        title={title}
        subtitle={subtitle}
        onPrevious={
          showNav && index > 0
            ? () => onSelect(siblings[index - 1]!)
            : undefined
        }
        onNext={
          showNav && index < siblings.length - 1
            ? () => onSelect(siblings[index + 1]!)
            : undefined
        }
        canPrevious={index > 0}
        canNext={index >= 0 && index < siblings.length - 1}
        headerSlot={
          !adding && songId ? (
            <div
              data-testid="song-header-actions"
              className="flex shrink-0 items-center gap-0.5"
            >
              <ShareButton path={`/songs/${songId}`} title={title} />
              {song ? (
                <Button
                  variant={editing ? "secondary" : "ghost"}
                  onClick={() => changeEditing(!editing)}
                  className="w-[4.5rem]"
                >
                  {editing ? "Cancel" : "Edit"}
                </Button>
              ) : null}
            </div>
          ) : null
        }
        footer={
          showForm ? (
            <Button
              type="submit"
              form={formId}
              size="lg"
              className="w-full"
              disabled={saving}
            >
              {saving ? "Saving..." : adding ? "Done" : "Save"}
            </Button>
          ) : undefined
        }
      >
        {body}
      </RightSheet>
      <DiscardChangesDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        onDiscard={() => {
          handleDirty(false);
          setEditing(false);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this song?"
        description={
          count > 0
            ? `This is in ${count} ${count === 1 ? "setlist" : "setlists"}. Deleting it removes it from ${count === 1 ? "that setlist" : "all of them"}.`
            : "This can't be undone."
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (!songId) return;
          remove.mutate(songId, {
            onSuccess: () => {
              handleDirty(false);
              onDeleted();
            },
          });
        }}
      />
    </>
  );
}
