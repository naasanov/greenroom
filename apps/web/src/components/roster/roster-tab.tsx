"use client";

import { Link2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import type { BandMember, BandSummary } from "@greenroom/shared";
import { Fab } from "@/components/app/fab";
import { EmptyState } from "@/components/app/empty-state";
import { InstrumentIcon, instrumentLabel } from "@/components/app/instruments";
import { ListCard } from "@/components/app/list-card";
import { InviteDrawer } from "@/components/roster/invite-drawer";
import { PlaceholderDrawer } from "@/components/roster/placeholder-drawer";
import { MemberSheet } from "@/components/roster/member-sheet";
import { memberInstruments } from "@/components/roster/member-utils";
import { Badge } from "@/components/ui/badge";
import { useMe, useMembers } from "@/lib/queries";

function MemberCard({
  member,
  selected,
  onSelect,
}: {
  member: BandMember;
  selected: boolean;
  onSelect: () => void;
}) {
  const instruments = memberInstruments(member);
  return (
    <li data-testid="member-card">
      <ListCard
        title={member.displayName}
        subtitle={instruments.map(instrumentLabel).join(", ") || undefined}
        thumbnail={member.avatarUrl}
        thumbnailIcon={
          <span className="text-xl font-semibold">
            {member.displayName.slice(0, 1).toUpperCase()}
          </span>
        }
        selected={selected}
        onClick={onSelect}
        trailing={
          <div
            onClick={onSelect}
            className="flex shrink-0 cursor-pointer items-center gap-2 py-3 pr-2 pl-1"
          >
            {instruments.length > 0 ? (
              <ul
                aria-label="Instruments"
                className="flex items-center gap-1.5 text-muted-foreground"
              >
                {instruments.slice(0, 3).map((i) => (
                  <li key={i} title={instrumentLabel(i)}>
                    <InstrumentIcon instrument={i} className="size-5" />
                  </li>
                ))}
              </ul>
            ) : null}
            {member.role === "admin" ? (
              <Badge variant="secondary">Admin</Badge>
            ) : null}
            {member.isPlaceholder ? (
              <Badge variant="outline">Not on Greenroom</Badge>
            ) : null}
          </div>
        }
      />
    </li>
  );
}

/** Roster: member cards, a detail sheet, and the invite or add menu where the FAB sits. */
export function RosterTab({ band }: { band: BandSummary }) {
  const members = useMembers(band.id);
  const me = useMe().data;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const selected = members.data?.find((m) => m.userId === selectedId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-28 md:pb-24">
      <h1 className="text-xl font-semibold">Roster</h1>
      {members.data ? (
        members.data.length > 0 ? (
          <ul className="flex flex-col gap-2.5" aria-label="Band members">
            {members.data.map((m) => (
              <MemberCard
                key={m.userId}
                member={m}
                selected={sheetOpen && m.userId === selectedId}
                onSelect={() => {
                  setSelectedId(m.userId);
                  setSheetOpen(true);
                }}
              />
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title="No members yet" />
        )
      ) : members.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the roster.
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading...
        </p>
      )}

      {band.role === "admin" ? (
        <Fab
          label="Add to roster"
          actions={[
            {
              key: "add-manually",
              label: "Add manually",
              icon: <UserPlus />,
              onSelect: () => setAddOpen(true),
            },
            {
              key: "invite",
              label: "Invite",
              icon: <Link2 />,
              onSelect: () => setInviteOpen(true),
            },
          ]}
        />
      ) : (
        /* Same spot as the FAB. The wrapper carries the safe-area inset so the pill keeps symmetric padding. */
        <div className="pr-safe fixed right-4 bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1rem)] z-30 md:bottom-6">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="flex h-14 items-center gap-2 rounded-full bg-primary px-5 text-base font-medium whitespace-nowrap text-primary-foreground shadow-lift outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95"
          >
            <Link2 className="size-5 shrink-0" /> Invite link
          </button>
        </div>
      )}

      <MemberSheet
        bandId={band.id}
        member={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        viewerIsAdmin={band.role === "admin"}
        viewerId={me?.id ?? ""}
        onEdit={() => setEditOpen(true)}
      />
      <PlaceholderDrawer
        bandId={band.id}
        member={null}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <PlaceholderDrawer
        bandId={band.id}
        member={selected?.isPlaceholder ? selected : null}
        open={editOpen}
        onOpenChange={setEditOpen}
        nested
      />
      <InviteDrawer
        band={band}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}
