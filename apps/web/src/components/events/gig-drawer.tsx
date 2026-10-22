"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
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
import { BESIDE_SHEET } from "@/components/events/beside-sheet";
import { GigForm } from "@/components/events/gig-form";
import { time12, whenLabel } from "@/components/events/time";
import { useDeleteGig, useUpdateGig } from "@/lib/queries/events";

function mapsUrl(gig: Gig): string {
  const query = [gig.venueName, gig.address].filter(Boolean).join(" ");
  const place = gig.googlePlaceId
    ? `&query_place_id=${encodeURIComponent(gig.googlePlaceId)}`
    : "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${place}`;
}

function GigDetails({ gig }: { gig: Gig }) {
  const hasContact = gig.contactName || gig.contactPhone || gig.contactEmail;
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-4 pt-1">
        <Fact label="When">
          <span data-testid="gig-when">{whenLabel(gig)}</span>
        </Fact>
        {gig.loadInTime ? (
          <Fact label="Load-in">{time12(gig.loadInTime)}</Fact>
        ) : null}
        {gig.venueName || gig.address ? (
          <Fact label="Venue">
            <span className="font-medium">{gig.venueName}</span>
            {gig.address ? (
              <span className="block text-muted-foreground">{gig.address}</span>
            ) : null}
            <a
              href={mapsUrl(gig)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-primary underline-offset-4 hover:underline"
            >
              Open in Maps
            </a>
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
      {/* Setlist, Lineup, and Media sections mount here in later tasks. */}
      <div data-testid="gig-sections" />
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
  /** Sits left of the agenda sheet on wide screens instead of centering on the page. */
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
      <BottomDrawer
        open={open}
        className={beside ? BESIDE_SHEET : undefined}
        onOpenChange={(open) => !open && onClose()}
        dismissible={!dirty}
        onDismissAttempt={requestClose}
        title={title}
        description={EVENT_TYPES.gig.label}
        headerAction={<ShareButton path={`/gigs/${gigId}`} title={title} />}
        footer={
          gig && !editing ? (
            <div className="flex gap-2">
              <Button
                className="flex-1"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <Button variant="destructive" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            </div>
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
        ) : editing ? (
          <GigForm
            idPrefix="gig-edit"
            bandId={bandId}
            gig={gig}
            timeZone={gig.timeZone}
            submitLabel="Save changes"
            onSubmit={save}
            onCancel={cancelEdit}
            onDirtyChange={onDirty}
          />
        ) : (
          <GigDetails gig={gig} />
        )}
      </BottomDrawer>

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
