"use client";

import { useCallback, useState } from "react";
import type { CreateGig, Gig, PracticeSeries } from "@greenroom/shared";
import { DiscardChangesDialog } from "@/components/app/confirm-dialogs";
import { EVENT_TYPES } from "@/components/app/event-types";
import { SplitDrawer } from "@/components/app/split-drawer";
import { eventDrawerClass } from "@/components/events/beside-sheet";
import { GigForm } from "@/components/events/gig-form";
import {
  PracticeForm,
  type PracticeSubmit,
} from "@/components/events/practice-form";
import { localTimeZone } from "@/components/events/time";
import { useCreateGig, useCreatePractice } from "@/lib/queries/events";

/** What the create drawer just made; the caller opens it. */
export type CreatedEvent =
  { kind: "gig"; gig: Gig } | { kind: "practice"; series: PracticeSeries };

/** The Practice | Gig split drawer for adding an event. */
export function CreateEventDrawer({
  bandId,
  open,
  defaultDate,
  onOpenChange,
  onCreated,
  beside = false,
}: {
  bandId: string;
  open: boolean;
  /** `YYYY-MM-DD` when opened from a day; empty from the FAB. */
  defaultDate: string;
  onOpenChange: (open: boolean) => void;
  /** Called after the drawer starts closing, so the caller can open the new event. */
  onCreated: (created: CreatedEvent) => void;
  /** Sits left of the agenda sheet on wide screens. */
  beside?: boolean;
}) {
  const createGig = useCreateGig(bandId);
  const createPractice = useCreatePractice(bandId);
  const [dirty, setDirty] = useState({ gig: false, practice: false });
  const [discardOpen, setDiscardOpen] = useState(false);
  const isDirty = dirty.gig || dirty.practice;
  const timeZone = localTimeZone();

  const setGigDirty = useCallback(
    (gig: boolean) => setDirty((d) => (d.gig === gig ? d : { ...d, gig })),
    [],
  );
  const setPracticeDirty = useCallback(
    (practice: boolean) =>
      setDirty((d) => (d.practice === practice ? d : { ...d, practice })),
    [],
  );

  function close() {
    setDirty({ gig: false, practice: false });
    setDiscardOpen(false);
    onOpenChange(false);
  }

  async function saveGig(payload: CreateGig) {
    const gig = await createGig.mutateAsync(payload);
    close();
    onCreated({ kind: "gig", gig });
  }

  async function savePractice(submit: PracticeSubmit) {
    if (submit.kind !== "create") return;
    const series = await createPractice.mutateAsync(submit.body);
    close();
    onCreated({ kind: "practice", series });
  }

  return (
    <>
      <SplitDrawer
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : close())}
        className={eventDrawerClass(beside)}
        dismissible={!isDirty}
        onDismissAttempt={() => setDiscardOpen(true)}
        title="New event"
        description="Choose Practice or Gig"
        left={{
          label: "Practice",
          title: "New practice",
          hint: "One-off or repeating",
          tone: "practice",
          icon: <EVENT_TYPES.practice.icon />,
          content: (
            <PracticeForm
              idPrefix="practice"
              defaultDate={defaultDate}
              timeZone={timeZone}
              submitLabel="Create practice"
              onSubmit={savePractice}
              onDirtyChange={setPracticeDirty}
            />
          ),
        }}
        right={{
          label: "Gig",
          title: "New gig",
          hint: "Title and date are enough",
          tone: "gig",
          icon: <EVENT_TYPES.gig.icon />,
          content: (
            <GigForm
              idPrefix="gig"
              bandId={bandId}
              defaultDate={defaultDate}
              timeZone={timeZone}
              submitLabel="Create gig"
              onSubmit={saveGig}
              onDirtyChange={setGigDirty}
            />
          ),
        }}
      />
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onDiscard={close}
      />
    </>
  );
}
