"use client";

import { ExternalLink, Loader2, Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CreateGig, Gig } from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import {
  ConfirmDialog,
  DiscardChangesDialog,
} from "@/components/app/confirm-dialogs";
import { EVENT_TYPES } from "@/components/app/event-types";
import { ShareButton } from "@/components/app/share-button";
import { Button } from "@/components/ui/button";
import { Fact } from "@/components/events/facts";
import { eventDrawerClass } from "@/components/events/beside-sheet";
import { GigForm } from "@/components/events/gig-form";
import { dayLabel, time12, timeRange } from "@/components/events/time";
import { MediaSection } from "@/components/media/media-section";
import { UploadLinkButton } from "@/components/media/upload-link-dialog";
import { LineupAside } from "@/components/lineups/lineup-aside";
import { LineupSection } from "@/components/lineups/lineup-section";
import {
  useLineupBuilder,
  type LineupBuilder,
} from "@/components/lineups/use-lineup-builder";
import { PickDndProvider } from "@/components/setlists/pick-dnd";
import { SetlistAside } from "@/components/setlists/setlist-aside";
import { SetlistSection } from "@/components/setlists/setlist-section";
import {
  useSetlistBuilder,
  type SetlistBuilder,
} from "@/components/setlists/use-setlist-builder";
import { useDeleteGig, useUpdateGig } from "@/lib/queries/events";
import { useGigSetlist } from "@/lib/queries/setlists";

function mapsUrl(gig: Gig): string {
  const query = [gig.venueName, gig.address].filter(Boolean).join(" ");
  const place = gig.googlePlaceId
    ? `&query_place_id=${encodeURIComponent(gig.googlePlaceId)}`
    : "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${place}`;
}

function GigDetails({
  bandId,
  gig,
  editing,
  onEdit,
  onSave,
  onCancel,
  onDirty,
  setlist,
  lineup,
}: {
  bandId: string;
  gig: Gig;
  editing: boolean;
  onEdit: () => void;
  onSave: (payload: CreateGig) => Promise<void>;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  setlist: SetlistBuilder;
  lineup: LineupBuilder;
}) {
  const hasContact = gig.contactName || gig.contactPhone || gig.contactEmail;
  const time = timeRange(gig);
  return (
    <div className="flex flex-col gap-6">
      <section
        data-testid="details-section"
        aria-labelledby="details-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 id="details-heading" className="text-base font-semibold">
            Details
          </h3>
          {editing ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Edit details"
              className="-mr-1.5 text-muted-foreground"
              onClick={onEdit}
            >
              <Pencil />
            </Button>
          )}
        </div>
        {editing ? (
          <GigForm
            idPrefix="gig-edit"
            bandId={bandId}
            gig={gig}
            timeZone={gig.timeZone}
            submitLabel="Save changes"
            onSubmit={onSave}
            onCancel={onCancel}
            onDirtyChange={onDirty}
          />
        ) : (
          <dl className="flex flex-col gap-4">
            <Fact label="When">
              <span
                data-testid="gig-when"
                className="flex flex-wrap justify-between gap-x-3"
              >
                <span>{dayLabel(gig.date)}</span>
                <span className="ml-auto">{time ?? "No time yet"}</span>
              </span>
            </Fact>
            {gig.loadInTime ? (
              <Fact label="Load-in">{time12(gig.loadInTime)}</Fact>
            ) : null}
            {gig.venueName || gig.address ? (
              <Fact label="Venue">
                <span className="flex items-start gap-2">
                  <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
                    <span className="font-medium">{gig.venueName}</span>
                    {gig.address ? (
                      <span className="ml-auto min-w-0 text-right break-words text-muted-foreground">
                        {gig.address}
                      </span>
                    ) : null}
                  </span>
                  <a
                    href={mapsUrl(gig)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open in Maps"
                    className="mt-0.5 shrink-0 text-primary"
                  >
                    <ExternalLink className="size-4" />
                  </a>
                </span>
              </Fact>
            ) : null}
            {hasContact ? (
              <Fact label="Point of contact">
                {gig.contactName ? <span>{gig.contactName}</span> : null}
                {gig.contactPhone ? (
                  <a
                    href={`tel:${gig.contactPhone}`}
                    className="block text-primary underline-offset-4 hover:underline"
                  >
                    {gig.contactPhone}
                  </a>
                ) : null}
                {gig.contactEmail ? (
                  <a
                    href={`mailto:${gig.contactEmail}`}
                    className="block text-primary underline-offset-4 hover:underline"
                  >
                    {gig.contactEmail}
                  </a>
                ) : null}
              </Fact>
            ) : null}
            {gig.notes ? (
              <Fact label="Notes">
                <span className="whitespace-pre-wrap">{gig.notes}</span>
              </Fact>
            ) : null}
          </dl>
        )}
      </section>
      <div data-testid="gig-sections" className="flex flex-col gap-6">
        <SetlistSection builder={setlist} />
        <LineupSection builder={lineup} />
        <MediaSection bandId={bandId} gigId={gig.id} />
        <UploadLinkButton bandId={bandId} gigId={gig.id} />
      </div>
    </div>
  );
}

/** View, edit and delete one gig in a bottom drawer. */
export function GigDrawer({
  bandId,
  gigId,
  gig,
  fallbackTitle,
  open = true,
  beside = false,
  onClose,
}: {
  bandId: string;
  gigId: string;
  gig: Gig | undefined;
  /** Shown while the full gig loads. */
  fallbackTitle?: string;
  /** False while the drawer slides away after being replaced or closed. */
  open?: boolean;
  /** Sits left of the agenda sheet on wide screens instead of left of the FAB column. */
  beside?: boolean;
  onClose: () => void;
}) {
  const update = useUpdateGig(bandId, gigId);
  const remove = useDeleteGig(bandId, gigId);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState<"close" | "cancel" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const onDirty = useCallback((d: boolean) => setDirty(d), []);
  const gigSetlist = useGigSetlist(bandId, gigId);
  const setlist = useSetlistBuilder({
    bandId,
    setlistId: gigSetlist.data?.id,
    beside,
    excludeGigId: gigId,
  });

  const { setLibraryOpen, setHistoryOpen } = setlist;
  const closeSetlistAsides = useCallback(() => {
    setLibraryOpen(false);
    setHistoryOpen(false);
  }, [setLibraryOpen, setHistoryOpen]);
  const lineup = useLineupBuilder({
    bandId,
    gigId,
    mode: setlist.mode,
    onOpenRoster: closeSetlistAsides,
  });
  const { setRosterOpen } = lineup;
  const setlistAsideOpen = setlist.libraryOpen || setlist.historyOpen;
  useEffect(() => {
    if (setlistAsideOpen) setRosterOpen(false);
  }, [setlistAsideOpen, setRosterOpen]);

  const requestClose = () => (dirty ? setDiscard("close") : onClose());
  const cancelEdit = () => (dirty ? setDiscard("cancel") : setEditing(false));

  async function save(payload: CreateGig) {
    await update.mutateAsync(payload);
    setDirty(false);
    setEditing(false);
  }

  const title = gig?.title ?? fallbackTitle ?? "Gig";
  return (
    <>
      <PickDndProvider>
        <BottomDrawer
          open={open}
          className={eventDrawerClass(setlist.besideEffective)}
          aside={
            <>
              <SetlistAside builder={setlist} />
              <LineupAside builder={lineup} />
            </>
          }
          onOpenChange={(open) => !open && onClose()}
          dismissible={!dirty}
          onDismissAttempt={requestClose}
          title={title}
          description={EVENT_TYPES.gig.label}
          headerAction={<ShareButton path={`/gigs/${gigId}`} title={title} />}
          headerLeading={
            gig ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete gig"
                className="text-muted-foreground"
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
            ) : undefined
          }
        >
          {!gig ? (
            <div className="flex justify-center py-10">
              <Loader2
                aria-label="Loading"
                className="size-5 animate-spin text-muted-foreground"
              />
            </div>
          ) : (
            <GigDetails
              bandId={bandId}
              gig={gig}
              editing={editing}
              onEdit={() => setEditing(true)}
              onSave={save}
              onCancel={cancelEdit}
              onDirty={onDirty}
              setlist={setlist}
              lineup={lineup}
            />
          )}
        </BottomDrawer>
      </PickDndProvider>

      <DiscardChangesDialog
        open={discard !== null}
        onOpenChange={(open) => !open && setDiscard(null)}
        onDiscard={() => {
          const action = discard;
          setDiscard(null);
          setDirty(false);
          if (action === "close") onClose();
          else setEditing(false);
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this gig?"
        description="The gig is removed from the calendar. Its media will remain in Google Drive."
        confirmLabel="Delete gig"
        destructive
        onConfirm={() => remove.mutate(undefined, { onSuccess: onClose })}
      />
    </>
  );
}
