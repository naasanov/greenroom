"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  copySetlistToPractice,
  useCreateGig,
  useCreatePractice,
} from "@/lib/queries/events";
import { useSetlistHistory } from "@/lib/queries/setlists";
import { dayLabel } from "@/components/events/time";

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
  registerClose,
  registerGuard,
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
  /** Receives a function that closes the drawer, asking first when it has unsaved input. */
  registerClose?: (close: (() => void) | null) => void;
  /**
   * Receives a guard for replacing the drawer's contents. It returns false when
   * clean; when dirty it asks to discard first and runs `proceed` on confirm.
   */
  registerGuard?: (guard: ((proceed: () => void) => boolean) | null) => void;
}) {
  const createGig = useCreateGig(bandId);
  const createPractice = useCreatePractice(bandId);
  const history = useSetlistHistory(bandId, "", open);
  const setlistOptions = history.data?.map((g) => ({
    id: g.setlistId,
    label: `Copy from ${g.title} (${dayLabel(g.date)}, ${g.songCount} ${g.songCount === 1 ? "song" : "songs"})`,
  }));
  const [dirty, setDirty] = useState({ gig: false, practice: false });
  const [discardOpen, setDiscardOpen] = useState(false);
  const afterDiscard = useRef<(() => void) | null>(null);
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

  const requestClose = () => (isDirty ? setDiscardOpen(true) : close());
  const requestCloseRef = useRef(requestClose);
  useEffect(() => {
    requestCloseRef.current = requestClose;
  });
  useEffect(() => {
    if (!open || !registerClose) return;
    registerClose(() => requestCloseRef.current());
    return () => registerClose(null);
  }, [open, registerClose]);

  const guardRef = useRef<(proceed: () => void) => boolean>(() => false);
  useEffect(() => {
    guardRef.current = (proceed) => {
      if (!isDirty) return false;
      afterDiscard.current = proceed;
      setDiscardOpen(true);
      return true;
    };
  });
  useEffect(() => {
    if (!open || !registerGuard) return;
    registerGuard((proceed) => guardRef.current(proceed));
    return () => registerGuard(null);
  }, [open, registerGuard]);

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
    if (submit.copySetlistId) {
      // The practice already exists; a failed copy leaves it without a setlist.
      await copySetlistToPractice(bandId, series, submit.copySetlistId).catch(
        () => {},
      );
    }
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
              setlistOptions={setlistOptions}
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
        onOpenChange={(next) => {
          setDiscardOpen(next);
          if (!next) afterDiscard.current = null;
        }}
        onDiscard={() => {
          const proceed = afterDiscard.current;
          afterDiscard.current = null;
          close();
          proceed?.();
        }}
      />
    </>
  );
}
