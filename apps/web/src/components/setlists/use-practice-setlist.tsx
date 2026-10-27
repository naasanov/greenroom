"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CustomSetlistOccurrence,
  PracticeOccurrence,
  SetlistDetail,
} from "@greenroom/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { dayLabel, zonedDate } from "@/components/events/time";
import { keys } from "@/lib/queries";
import {
  usePracticeSetlistApi,
  type SetlistConflictChoice,
} from "@/lib/queries/events";
import { setlistKeys } from "@/lib/queries/setlists";
import type { BeforeChange } from "./use-setlist-builder";

type Answer = SetlistConflictChoice | null;

function conflictText(later: CustomSetlistOccurrence[], timeZone: string) {
  const dates = later.map((c) =>
    dayLabel(zonedDate(c.originalStart, timeZone)),
  );
  return later.length === 1
    ? `${dates[0]} has its own setlist. Replace it or keep it?`
    : `${later.length} later practices have their own setlist (${dates.join(", ")}). Replace them or keep them?`;
}

/**
 * Edit guard for a practice occurrence's setlist. The first edit of a drawer
 * session asks the replace-or-keep question (when later practices have their
 * own setlist) and forks a new setlist starting here when the occurrence
 * shares an earlier one or has none; later edits go straight to that setlist.
 */
export function usePracticeSetlist({
  bandId,
  seriesId,
  occurrenceKey,
  occ,
}: {
  bandId: string;
  seriesId: string;
  occurrenceKey: string;
  occ: PracticeOccurrence | undefined;
}) {
  const qc = useQueryClient();
  const api = usePracticeSetlistApi(bandId, seriesId, occurrenceKey);
  const occRef = useRef(occ);
  useEffect(() => {
    occRef.current = occ;
  });
  const answer = useRef<Answer>(null);
  // True once this session's first edit succeeded; later edits skip the checks.
  const answered = useRef(false);
  const inflight = useRef<Promise<string | false> | null>(null);
  const asking = useRef<((a: Answer) => void) | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(
    (later: CustomSetlistOccurrence[], timeZone: string) =>
      new Promise<Answer>((resolve) => {
        asking.current = resolve;
        setQuestion(conflictText(later, timeZone));
      }),
    [],
  );
  const settle = useCallback((a: Answer) => {
    const resolve = asking.current;
    asking.current = null;
    setQuestion(null);
    resolve?.(a);
  }, []);

  /** Resolves the conflict choice, asking once per session when it matters. */
  const choose = useCallback(
    async (current: PracticeOccurrence): Promise<Answer | "none"> => {
      if (current.laterCustomSetlists.length === 0) return "none";
      if (answer.current) return answer.current;
      const a = await ask(current.laterCustomSetlists, current.timeZone);
      if (a) answer.current = a;
      return a;
    },
    [ask],
  );

  const patchOccurrence = useCallback(
    (patch: (o: PracticeOccurrence) => PracticeOccurrence) =>
      qc.setQueryData<PracticeOccurrence>(
        keys.occurrence(bandId, seriesId, occurrenceKey),
        (o) => (o ? patch(o) : o),
      ),
    [qc, bandId, seriesId, occurrenceKey],
  );

  const firstEdit = useCallback(async (): Promise<string | false> => {
    const current = occRef.current;
    if (!current) return false;
    const picked = await choose(current);
    if (picked === null) return false;
    const onConflict: SetlistConflictChoice =
      picked === "none" ? "replace" : picked;
    const dropsLater = picked === "replace";
    try {
      if (current.setlistStartsHere && current.setlistId) {
        if (dropsLater) {
          await api.replaceLater(current.setlistId);
          patchOccurrence((o) => ({ ...o, laterCustomSetlists: [] }));
          void api.refresh();
        }
        return current.setlistId;
      }
      const res = await api.fork(onConflict);
      const from = current.setlistId
        ? qc.getQueryData<SetlistDetail>(
            setlistKeys.detail(bandId, current.setlistId),
          )
        : undefined;
      qc.setQueryData<SetlistDetail>(
        setlistKeys.detail(bandId, res.newSetlistId),
        {
          id: res.newSetlistId,
          bandId,
          items: from?.items ?? [],
          songCount: from?.songCount ?? 0,
          totalDurationSeconds: from?.totalDurationSeconds ?? 0,
          unknownDurationCount: from?.unknownDurationCount ?? 0,
        },
      );
      patchOccurrence((o) => ({
        ...o,
        setlistId: res.newSetlistId,
        setlistSource: "forward",
        setlistStartsHere: true,
        laterCustomSetlists:
          dropsLater || picked === "none" ? [] : o.laterCustomSetlists,
      }));
      void api.refresh();
      return res.newSetlistId;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not change the setlist.",
      );
      return false;
    }
  }, [choose, api, qc, bandId, patchOccurrence]);

  const beforeChange = useCallback<BeforeChange>(async () => {
    if (inflight.current) return inflight.current;
    const current = occRef.current;
    if (current?.setlistStartsHere && current.setlistId && answered.current) {
      return current.setlistId;
    }
    setError(null);
    const run = firstEdit();
    inflight.current = run;
    const result = await run;
    inflight.current = null;
    answered.current = result !== false;
    return result;
  }, [firstEdit]);
  /** Clears the occurrence's setlist for this and later practices. */
  const remove = useCallback(async () => {
    const current = occRef.current;
    if (!current?.setlistId) return;
    setError(null);
    const picked = await choose(current);
    if (picked === null) return;
    try {
      await api.clear(picked === "keep" ? "keep" : "replace");
      answered.current = false;
      patchOccurrence((o) => ({
        ...o,
        setlistId: null,
        setlistSource: null,
        setlistStartsHere: false,
        laterCustomSetlists: picked === "keep" ? o.laterCustomSetlists : [],
      }));
      void api.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not remove the setlist.",
      );
    }
  }, [choose, api, patchOccurrence]);

  const dialog = (
    <AlertDialog
      open={question !== null}
      onOpenChange={(o) => !o && settle(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">
            Change later setlists?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm">
            {question}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={() => settle("keep")}>
            Keep
          </AlertDialogAction>
          <AlertDialogAction variant="danger" onClick={() => settle("replace")}>
            Replace
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { beforeChange, remove, dialog, error };
}
