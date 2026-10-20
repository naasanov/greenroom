"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BAND_ERROR_CODES, type BandSummary } from "@greenroom/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { SectionCard } from "@/components/settings/section-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api";
import { useLeaveBand, useMembers } from "@/lib/queries";

const LAST_ADMIN_MESSAGE =
  "You are the last admin. Make another member an admin on the Roster tab before you leave.";

/** Leave the current band; the only member must delete it, typing its name to confirm. */
export function LeaveBandSection({ band }: { band: BandSummary }) {
  const router = useRouter();
  const members = useMembers(band.id);
  const leave = useLeaveBand(band.id);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const alone = members.data?.length === 1;

  /** Awaited rather than per-call callbacks: this section remounts when the band list refreshes. */
  async function run(deleteBand: boolean) {
    setError(null);
    try {
      await leave.mutateAsync({ deleteBand });
      router.replace("/events");
    } catch (e) {
      setConfirmDelete(false);
      if (isApiError(e, 409) && e.code === BAND_ERROR_CODES.lastAdmin) {
        setError(LAST_ADMIN_MESSAGE);
      } else if (
        isApiError(e, 409) &&
        e.code === BAND_ERROR_CODES.onlyMemberMustDelete
      ) {
        setConfirmDelete(true);
      } else {
        setError("We could not leave the band. Please try again.");
      }
    }
  }

  return (
    <SectionCard id="settings-leave" title="Leave band" testId="settings-leave">
      <p className="text-sm text-muted-foreground">
        {alone
          ? `You are the only member of ${band.name}. Leaving deletes the band and everything in it.`
          : `You will lose access to ${band.name}. Your past gigs and songs stay with the band.`}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button
        variant="destructive"
        size="lg"
        disabled={leave.isPending || !members.data}
        onClick={() => {
          setError(null);
          if (alone) {
            setTyped("");
            setConfirmDelete(true);
          } else {
            setConfirmLeave(true);
          }
        }}
      >
        {alone ? "Delete band" : `Leave ${band.name}`}
      </Button>

      <ConfirmDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        title={`Leave ${band.name}?`}
        description="You will need a new invite link to rejoin."
        confirmLabel="Leave band"
        destructive
        onConfirm={() => void run(false)}
      />

      <Dialog
        open={confirmDelete}
        onOpenChange={(o) => {
          setConfirmDelete(o);
          if (!o) setTyped("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Delete {band.name}?
            </DialogTitle>
            <DialogDescription>
              You are the only member, so leaving permanently deletes the band,
              its gigs, songs, and setlists. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={`Type ${band.name} to confirm`}
            placeholder={band.name}
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={typed.trim() !== band.name || leave.isPending}
              onClick={() => void run(true)}
            >
              Delete band
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}
