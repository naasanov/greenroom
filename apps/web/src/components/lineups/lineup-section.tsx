"use client";

import { History, UserPlus, X } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { PickTarget, TargetRow } from "@/components/setlists/pick-dnd";
import { PersonLine, PersonOverlay } from "./person-row";
import { LINEUP_TARGET, type LineupBuilder } from "./use-lineup-builder";

/**
 * The editable lineup inside the gig drawer: rows sorted by name with remove
 * buttons, plus Add people / Copy from last gig. Every change saves at once.
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
    <section
      data-testid="lineup-section"
      aria-labelledby="lineup-heading"
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="lineup-heading" className="text-base font-semibold">
          Lineup
        </h3>
        {count ? (
          <p
            data-testid="lineup-count"
            className="text-sm text-muted-foreground tabular-nums"
          >
            {count}
          </p>
        ) : null}
      </div>

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
            <p
              data-testid="lineup-empty"
              className="flex h-14 items-center rounded-2xl border border-dashed px-4 text-sm text-muted-foreground"
            >
              No one is in the lineup yet. Add people or copy the last gig.
            </p>
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
                    <PersonLine person={m} member={member} left={m.left} />
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
      {builder.noPrevious ? (
        <p
          role="status"
          data-testid="lineup-no-previous"
          className="text-sm text-muted-foreground"
        >
          No earlier gig has a lineup yet.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          aria-expanded={builder.rosterOpen}
          onClick={() => {
            editor.clearError();
            builder.setRosterOpen(!builder.rosterOpen);
          }}
        >
          <UserPlus /> Add people
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={builder.copyPending || !rows}
          onClick={builder.copyLast}
        >
          <History />{" "}
          {builder.copyPending ? "Copying..." : "Copy from last gig"}
        </Button>
      </div>
    </section>
  );
}
