"use client";

import { useCallback, useMemo, useState } from "react";
import type { BandMember, Lineup, LineupMember } from "@greenroom/shared";
import { SETLIST_ERROR_CODES } from "@greenroom/shared";
import { isApiError } from "@/lib/api";
import { useMembers } from "@/lib/queries";
import {
  useCopyLastLineup,
  useLineup,
  useLineupEditor,
  type LineupEditor,
} from "@/lib/queries/lineups";
import type { LibraryMode } from "@/components/setlists/use-setlist-builder";

export const LINEUP_TARGET = "lineup";

export interface LineupBuilder {
  bandId: string;
  lineup: Lineup | undefined;
  loadError: boolean;
  /** Active band members, or undefined while loading. */
  members: BandMember[] | undefined;
  editor: LineupEditor;
  rosterOpen: boolean;
  setRosterOpen: (open: boolean) => void;
  /** Adds the member, or removes them when already in the lineup. */
  toggle: (member: BandMember) => void;
  remove: (membershipId: string) => void;
  /** Applies a full id order from a drag; ids not yet present come from the roster. */
  applyIds: (ids: string[]) => void;
  copyLast: () => void;
  copyPending: boolean;
  /** Set after copy-from-last finds no earlier lineup. */
  noPrevious: boolean;
  copyFailed: boolean;
  mode: LibraryMode;
}

const toLineupMember = (m: BandMember): LineupMember => ({
  membershipId: m.membershipId,
  userId: m.userId,
  displayName: m.displayName,
  avatarUrl: m.avatarUrl,
  left: false,
});

/**
 * State and edits for one gig's lineup, shared by the section in the gig drawer
 * and the roster drawer beside it. `mode` is the setlist builder's placement.
 * `onOpenRoster` runs when the roster opens so other asides can close.
 */
export function useLineupBuilder({
  bandId,
  gigId,
  mode,
  onOpenRoster,
}: {
  bandId: string;
  gigId: string;
  mode: LibraryMode;
  onOpenRoster?: () => void;
}): LineupBuilder {
  const lineupQuery = useLineup(bandId, gigId);
  const membersQuery = useMembers(bandId);
  const editor = useLineupEditor(bandId, gigId);
  const copyMutation = useCopyLastLineup(bandId, gigId);
  const [rosterOpen, setRosterOpenState] = useState(false);

  const lineup = lineupQuery.data;
  const members = membersQuery.data;
  const setMembers = editor.setMembers;
  const current = useMemo(() => lineup?.members ?? [], [lineup?.members]);

  const setRosterOpen = useCallback(
    (open: boolean) => {
      setRosterOpenState(open);
      if (open) onOpenRoster?.();
    },
    [onOpenRoster],
  );

  const toggle = useCallback(
    (member: BandMember) => {
      if (!lineup) return;
      if (current.some((m) => m.membershipId === member.membershipId)) {
        setMembers(
          current.filter((m) => m.membershipId !== member.membershipId),
        );
      } else {
        setMembers([...current, toLineupMember(member)]);
      }
    },
    [lineup, current, setMembers],
  );

  const remove = useCallback(
    (membershipId: string) => {
      if (!lineup) return;
      setMembers(current.filter((m) => m.membershipId !== membershipId));
    },
    [lineup, current, setMembers],
  );

  const applyIds = useCallback(
    (ids: string[]) => {
      if (!lineup) return;
      const known = new Map(current.map((m) => [m.membershipId, m]));
      for (const m of members ?? []) {
        if (!known.has(m.membershipId))
          known.set(m.membershipId, toLineupMember(m));
      }
      setMembers(ids.flatMap((id) => known.get(id) ?? []));
    },
    [lineup, current, members, setMembers],
  );

  const { mutate, reset } = copyMutation;
  const copyLast = useCallback(() => {
    editor.clearError();
    reset();
    mutate();
  }, [editor, mutate, reset]);

  const err = copyMutation.error;
  const noPrevious =
    isApiError(err, 404) && err.code === SETLIST_ERROR_CODES.noPreviousLineup;

  return {
    bandId,
    lineup,
    loadError: lineupQuery.isError,
    members,
    editor,
    rosterOpen,
    setRosterOpen,
    toggle,
    remove,
    applyIds,
    copyLast,
    copyPending: copyMutation.isPending,
    noPrevious,
    copyFailed: copyMutation.isError && !noPrevious,
    mode,
  };
}
