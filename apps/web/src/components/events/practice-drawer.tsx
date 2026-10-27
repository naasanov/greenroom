"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import type {
  EditScope as ApiScope,
  PracticeEditResult,
  PracticeOccurrence,
  RsvpStatus as ApiRsvp,
} from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import {
  ConfirmDialog,
  DiscardChangesDialog,
  EditScopeDialog,
  type EditScope,
} from "@/components/app/confirm-dialogs";
import { EVENT_TYPES } from "@/components/app/event-types";
import {
  AttendeeList,
  type Attendee,
  type RsvpStatus,
} from "@/components/app/rsvp";
import { SegmentedToggle } from "@/components/app/segmented-toggle";
import { ShareButton } from "@/components/app/share-button";
import { Button } from "@/components/ui/button";
import { Fact } from "@/components/events/facts";
import { PickDndProvider } from "@/components/setlists/pick-dnd";
import { SetlistAside } from "@/components/setlists/setlist-aside";
import { SetlistSection } from "@/components/setlists/setlist-section";
import { usePracticeSetlist } from "@/components/setlists/use-practice-setlist";
import {
  useSetlistBuilder,
  type SetlistBuilder,
} from "@/components/setlists/use-setlist-builder";
import { eventDrawerClass } from "@/components/events/beside-sheet";
import {
  PracticeForm,
  type PracticeEditDraft,
  type PracticeInitial,
  type PracticeSubmit,
} from "@/components/events/practice-form";
import { recurrenceSummary } from "@/components/events/recurrence";
import { whenLabel, wallClock } from "@/components/events/time";
import { useMe } from "@/lib/queries";
import {
  useDeletePractice,
  usePracticeSeries,
  useSetRsvp,
  useUpdatePractice,
} from "@/lib/queries/events";

const SCOPE_TO_API: Record<EditScope, ApiScope> = {
  this: "this",
  following: "this_and_following",
  all: "all",
};

const UI_STATUS: Record<ApiRsvp, RsvpStatus> = {
  going: "going",
  maybe: "maybe",
  not_going: "declined",
  no_response: "none",
};

type RsvpChoice = "going" | "maybe" | "not_going";

const RSVP_OPTIONS = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "not_going", label: "Not going" },
] as const;

function PracticeDetails({
  bandId,
  occ,
  setlist,
  onRemoveSetlist,
  setlistError,
}: {
  bandId: string;
  occ: PracticeOccurrence;
  setlist: SetlistBuilder;
  onRemoveSetlist: () => void;
  setlistError: string | null;
}) {
  const me = useMe().data;
  const rsvp = useSetRsvp(bandId, occ.seriesId, occ.occurrenceKey, me?.id);
  const series = usePracticeSeries(bandId, occ.seriesId, occ.recurring);
  const attendees: Attendee[] = occ.attendees.map((a) => ({
    id: a.userId,
    name: a.displayName,
    imageUrl: a.avatarUrl,
    status: UI_STATUS[a.status],
  }));
  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-4 pt-1">
        <Fact label="When">
          <span data-testid="practice-when">{whenLabel(occ)}</span>
        </Fact>
        {occ.location ? <Fact label="Location">{occ.location}</Fact> : null}
        {occ.recurring && series.data ? (
          <Fact label="Repeats">
            {recurrenceSummary(series.data.recurrence, series.data.startDate)}
          </Fact>
        ) : null}
      </dl>

      <section aria-label="Your RSVP" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Your RSVP</h3>
        <SegmentedToggle<RsvpChoice>
          label="Your RSVP"
          fullWidth
          value={(occ.myRsvp === "no_response" ? "" : occ.myRsvp) as RsvpChoice}
          onValueChange={(status) => rsvp.mutate(status)}
          options={RSVP_OPTIONS}
        />
      </section>

      <section aria-label="Attendees" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Who&apos;s coming</h3>
        <AttendeeList attendees={attendees} />
      </section>

      <SetlistSection
        builder={setlist}
        caption={
          occ.recurring ? "Changes apply to this and later practices." : null
        }
        extra={
          occ.setlistId ? (
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              onClick={onRemoveSetlist}
            >
              Remove setlist
            </Button>
          ) : null
        }
      />
      {setlistError ? (
        <p role="alert" className="text-sm text-destructive">
          {setlistError}
        </p>
      ) : null}
    </div>
  );
}

/** View, RSVP, edit (with scope) and delete one practice occurrence. */
export function PracticeDrawer({
  bandId,
  seriesId,
  occurrenceKey,
  occ,
  fallbackTitle,
  open = true,
  beside = false,
  onClose,
  onEdited,
}: {
  bandId: string;
  seriesId: string;
  occurrenceKey: string;
  occ: PracticeOccurrence | undefined;
  fallbackTitle?: string;
  /** False while the drawer slides away after being replaced or closed. */
  open?: boolean;
  /** Sits left of the agenda sheet on wide screens instead of centering on the page. */
  beside?: boolean;
  onClose: () => void;
  /** Called with the edit result so the caller can follow the occurrence. */
  onEdited: (result: PracticeEditResult) => void;
}) {
  const update = useUpdatePractice(bandId, seriesId, occurrenceKey);
  const remove = useDeletePractice(bandId, seriesId, occurrenceKey);
  const [deleteScopeOpen, setDeleteScopeOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pendingSave, setPendingSave] = useState<PracticeEditDraft | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState<"close" | "cancel" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onDirty = useCallback((d: boolean) => setDirty(d), []);
  const series = usePracticeSeries(bandId, seriesId, editing);
  const practiceSetlist = usePracticeSetlist({
    bandId,
    seriesId,
    occurrenceKey,
    occ,
  });
  const setlist = useSetlistBuilder({
    bandId,
    setlistId: occ?.setlistId ?? undefined,
    beside,
    beforeChange: practiceSetlist.beforeChange,
    allowEmpty: true,
  });

  const requestClose = () => (dirty ? setDiscard("close") : onClose());
  const cancelEdit = () => (dirty ? setDiscard("cancel") : setEditing(false));

  async function applyScope(draft: PracticeEditDraft, scope: ApiScope) {
    setSaveError(null);
    try {
      const result = await update.mutateAsync(draft.build(scope));
      setDirty(false);
      setEditing(false);
      onEdited(result);
    } catch (e) {
      setSaveError(
        e instanceof Error ? e.message : "Could not save the practice.",
      );
    }
  }

  async function save(submit: PracticeSubmit) {
    if (submit.kind !== "edit") return;
    if (occ?.recurring) setPendingSave(submit.draft);
    else await applyScope(submit.draft, "all");
  }

  // The form shows this occurrence's values alongside the series recurrence.
  function initialFor(): PracticeInitial | undefined {
    if (!occ || !series.data) return undefined;
    return {
      title: occ.title,
      location: occ.location,
      startDate: occ.date,
      startTime: wallClock(occ.startsAt, occ.timeZone).time,
      durationMinutes: occ.durationMinutes,
      recurrence: series.data.recurrence,
    };
  }

  const title = occ?.title ?? fallbackTitle ?? "Practice";
  const editInitial = editing ? initialFor() : undefined;
  const path = occ
    ? `/practices/${seriesId}?date=${occ.date}`
    : `/practices/${seriesId}`;

  return (
    <>
      <PickDndProvider>
        <BottomDrawer
          open={open}
          className={eventDrawerClass(setlist.besideEffective)}
          aside={<SetlistAside builder={setlist} />}
          onOpenChange={(open) => !open && onClose()}
          dismissible={!dirty}
          onDismissAttempt={requestClose}
          title={title}
          description={EVENT_TYPES.practice.label}
          headerAction={<ShareButton path={path} title={title} />}
          footer={
            occ && !editing ? (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  variant="outline"
                  onClick={() => {
                    setSaveError(null);
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    occ.recurring
                      ? setDeleteScopeOpen(true)
                      : setConfirmDelete(true)
                  }
                >
                  Delete
                </Button>
              </div>
            ) : undefined
          }
        >
          {!occ ? (
            <div className="flex justify-center py-10">
              <Loader2
                aria-label="Loading"
                className="size-5 animate-spin text-muted-foreground"
              />
            </div>
          ) : editing ? (
            editInitial ? (
              <PracticeForm
                idPrefix="practice-edit"
                initial={editInitial}
                editing
                seriesStartDate={series.data?.startDate}
                externalError={saveError}
                timeZone={series.data?.timeZone ?? occ.timeZone}
                submitLabel="Save changes"
                onSubmit={save}
                onCancel={cancelEdit}
                onDirtyChange={onDirty}
              />
            ) : (
              <div className="flex justify-center py-10">
                <Loader2
                  aria-label="Loading"
                  className="size-5 animate-spin text-muted-foreground"
                />
              </div>
            )
          ) : (
            <PracticeDetails
              bandId={bandId}
              occ={occ}
              setlist={setlist}
              onRemoveSetlist={() => void practiceSetlist.remove()}
              setlistError={practiceSetlist.error}
            />
          )}
        </BottomDrawer>
      </PickDndProvider>
      {practiceSetlist.dialog}

      <EditScopeDialog
        open={deleteScopeOpen}
        onOpenChange={setDeleteScopeOpen}
        action="cancel"
        onConfirm={(scope) =>
          remove.mutate(SCOPE_TO_API[scope], { onSuccess: onClose })
        }
      />
      <EditScopeDialog
        open={pendingSave !== null}
        onOpenChange={(open) => !open && setPendingSave(null)}
        action="edit"
        hide={[
          ...(pendingSave?.recurrenceChanged ? (["this"] as const) : []),
          ...(pendingSave?.dateChanged ? (["following"] as const) : []),
        ]}
        onConfirm={(scope) => {
          if (pendingSave) void applyScope(pendingSave, SCOPE_TO_API[scope]);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this practice?"
        description="It is removed from the calendar for everyone."
        confirmLabel="Delete practice"
        destructive
        onConfirm={() => remove.mutate("all", { onSuccess: onClose })}
      />
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
    </>
  );
}
