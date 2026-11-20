"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo } from "react";
import { CollapsibleSection } from "@/components/events/collapsible-section";
import { Button } from "@/components/ui/button";
import { AsideDismissContext } from "@/components/app/bottom-drawer";
import { MemberSheet } from "@/components/roster/member-sheet";
import { useMe } from "@/lib/queries";
import { PickTarget, TargetRow } from "@/components/setlists/pick-dnd";
import { PersonLine, PersonOverlay } from "./person-row";
import { LINEUP_TARGET, type LineupBuilder } from "./use-lineup-builder";

/**
 * The editable lineup inside the gig drawer: rows sorted by name with remove
 * buttons. The header's pencil opens the roster drawer. Every change saves at
 * once.
 */
export function LineupSection({ builder }: { builder: LineupBuilder }) {
  const { lineup, members, editor } = builder;
  const rows = lineup?.members;
  const ids = useMemo(() => rows?.map((m) => m.membershipId) ?? [], [rows]);
  const byUser = useMemo(
    () => new Map(members?.map((m) => [m.userId, m])),
    [members],
  );
  const applyIds = builder.applyIds;
  const onChange = useCallback((next: string[]) => applyIds(next), [applyIds]);

  const present = rows?.filter((m) => !m.left).length ?? 0;
  const count =
    rows && members
      ? `${present} of ${members.length} ${members.length === 1 ? "member" : "members"}`
      : null;

  return (
    <CollapsibleSection
      testId="lineup-section"
      headingId="lineup-heading"
      title="Lineup"
      meta={
        count ? (
          <p
            data-testid="lineup-count"
            className="text-sm text-muted-foreground tabular-nums"
          >
            {count}
          </p>
        ) : null
      }
      actions={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Edit lineup"
          className="text-muted-foreground"
          aria-expanded={builder.rosterOpen}
          onClick={() => {
            editor.clearError();
            builder.setRosterOpen(!builder.rosterOpen);
          }}
        >
          <Pencil />
        </Button>
      }
    >
      {!rows ? (
        builder.loadError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not load the lineup.
          </p>
        ) : (
          <div
            aria-busy="true"
            className="h-14 animate-pulse rounded-2xl bg-muted"
          />
        )
      ) : (
        <PickTarget
          targetId={LINEUP_TARGET}
          ids={ids}
          onChange={onChange}
          empty={
            <button
              type="button"
              data-testid="lineup-empty"
              onClick={() => {
                editor.clearError();
                builder.setRosterOpen(true);
              }}
              className="flex min-h-24 w-full items-center justify-center gap-2 rounded-2xl border border-dashed text-base font-medium text-muted-foreground transition-colors outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Plus className="size-5" /> Add people
            </button>
          }
        >
          {rows.map((m) => {
            const member = byUser.get(m.userId);
            return (
              <TargetRow
                key={m.membershipId}
                itemId={m.membershipId}
                reorder={false}
                overlay={<PersonOverlay person={m} member={member} />}
              >
                {() => (
                  <div
                    data-testid="lineup-row"
                    className="flex h-full items-center gap-2.5 rounded-2xl border bg-card pr-1 pl-2.5 shadow-soft"
                  >
                    <PersonLine
                      person={m}
                      member={member}
                      left={m.left}
                      onOpenMember={
                        member && !member.isPlaceholder
                          ? () => builder.setMemberSheetId(member.userId)
                          : undefined
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${m.displayName}`}
                      className="shrink-0 text-muted-foreground"
                      onClick={() => builder.remove(m.membershipId)}
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </TargetRow>
            );
          })}
        </PickTarget>
      )}

      {editor.error || builder.copyFailed ? (
        <p role="alert" className="text-sm text-destructive">
          Could not save that change. The lineup was reloaded.
        </p>
      ) : null}
    </CollapsibleSection>
  );
}

/** The member sheet for a lineup row, rendered inside the gig drawer's aside slot. */
export function LineupMemberSheet({ builder }: { builder: LineupBuilder }) {
  const { members, memberSheetId, setMemberSheetId } = builder;
  const me = useMe().data;
  const registerAside = useContext(AsideDismissContext);
  const member = members?.find((m) => m.userId === memberSheetId) ?? null;
  const open = memberSheetId !== null && member !== null;
  const close = useCallback(() => setMemberSheetId(null), [setMemberSheetId]);

  useEffect(() => {
    if (!registerAside || !open) return;
    registerAside(close);
    return () => registerAside(null, close);
  }, [registerAside, open, close]);

  // Mounted only while a member is selected so no idle right-sheet exists.
  if (!member) return null;

  return (
    <MemberSheet
      bandId={builder.bandId}
      member={member}
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      viewerIsAdmin={
        members?.find((m) => m.userId === me?.id)?.role === "admin"
      }
      viewerId={me?.id ?? ""}
      placement="contained"
    />
  );
}
