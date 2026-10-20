"use client";

import { Check, Copy, Link2, Share2, Users } from "lucide-react";
import { useState } from "react";
import type { BandMember, BandSummary } from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { EmptyState } from "@/components/app/empty-state";
import { toneFor } from "@/components/app/event-types";
import { InstrumentIcon, instrumentLabel } from "@/components/app/instruments";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInviteLink, useMembers, useResetInvite } from "@/lib/queries";
import { cn } from "@/lib/utils";

function MemberCard({ member }: { member: BandMember }) {
  const instruments = [
    ...member.instruments.presets,
    ...member.instruments.custom,
  ];
  return (
    <li
      data-testid="member-card"
      className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-soft"
    >
      <Avatar className="size-12">
        {member.avatarUrl ? (
          <AvatarImage src={member.avatarUrl} alt="" />
        ) : null}
        <AvatarFallback
          className={cn("text-base font-semibold", toneFor(member.userId))}
        >
          {member.displayName.slice(0, 1).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-semibold">{member.displayName}</span>
        {instruments.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
            {instruments.map((i) => (
              <li
                key={i}
                title={instrumentLabel(i)}
                className="flex items-center gap-1 text-xs"
              >
                <InstrumentIcon instrument={i} className="size-4" />
                {instrumentLabel(i)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {member.role === "admin" ? (
        <Badge variant="secondary">Admin</Badge>
      ) : null}
    </li>
  );
}

function InviteDrawer({
  band,
  open,
  onOpenChange,
}: {
  band: BandSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useInviteLink(band.id, open);
  const reset = useResetInvite(band.id);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const url = invite.data?.url ?? "";
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the field stays selectable for a manual copy.
    }
  }

  return (
    <>
      <BottomDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Invite bandmates"
        description={`Anyone with this link can join ${band.name}.`}
      >
        <div className="flex flex-col gap-3 pt-2">
          <Input
            readOnly
            aria-label="Invite link"
            value={invite.isLoading ? "Loading..." : url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={copy} disabled={!url}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy link"}
            </Button>
            {canShare ? (
              <Button
                size="lg"
                variant="outline"
                disabled={!url}
                onClick={() =>
                  void navigator
                    .share({ title: `Join ${band.name} on Greenroom`, url })
                    .catch(() => undefined)
                }
              >
                <Share2 /> Share
              </Button>
            ) : null}
          </div>
          {band.role === "admin" ? (
            <Button
              variant="ghost"
              className="self-start text-muted-foreground"
              onClick={() => setConfirmReset(true)}
            >
              Reset link
            </Button>
          ) : null}
        </div>
      </BottomDrawer>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset invite link?"
        description="The current link stops working. Anyone who still needs to join will need the new one."
        confirmLabel="Reset link"
        destructive
        onConfirm={() => reset.mutate()}
      />
    </>
  );
}

/** Minimal roster: member cards and the invite link button. */
export function RosterTab({ band }: { band: BandSummary }) {
  const members = useMembers(band.id);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Roster</h1>
        <Button onClick={() => setInviteOpen(true)}>
          <Link2 /> Invite link
        </Button>
      </div>
      {members.data ? (
        members.data.length > 0 ? (
          <ul className="flex flex-col gap-2.5" aria-label="Band members">
            {members.data.map((m) => (
              <MemberCard key={m.userId} member={m} />
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
      <InviteDrawer
        band={band}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  );
}
