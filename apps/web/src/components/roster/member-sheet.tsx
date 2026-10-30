"use client";

import { Mail, Pencil, ShieldCheck, ShieldOff, UserMinus } from "lucide-react";
import { useState } from "react";
import { BAND_ERROR_CODES, type BandMember } from "@greenroom/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { InstrumentIcon, instrumentLabel } from "@/components/app/instruments";
import { RightSheet } from "@/components/app/right-sheet";
import { MemberAvatar } from "@/components/roster/member-avatar";
import { memberInstruments } from "@/components/roster/member-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import { useRemoveMember, useSetMemberRole } from "@/lib/queries";

/** Member detail: contact, instruments, and admin-only role and removal actions. */
export function MemberSheet({
  bandId,
  member,
  open,
  onOpenChange,
  viewerIsAdmin,
  viewerId,
  onEdit,
}: {
  bandId: string;
  member: BandMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewerIsAdmin: boolean;
  viewerId: string;
  onEdit?: () => void;
}) {
  const setRole = useSetMemberRole(bandId);
  const remove = useRemoveMember(bandId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const instruments = member ? memberInstruments(member) : [];
  const canManage = viewerIsAdmin && !!member && member.userId !== viewerId;

  function fail(e: unknown) {
    setError(
      isApiError(e) && e.code === BAND_ERROR_CODES.lastAdmin
        ? "A band needs at least one admin."
        : "That did not work. Please try again.",
    );
  }

  return (
    <>
      <RightSheet
        open={open}
        onOpenChange={(o) => {
          if (!o) setError(null);
          onOpenChange(o);
        }}
        title={member?.displayName ?? "Member"}
        subtitle={
          member?.role === "admin"
            ? "Admin"
            : member?.isPlaceholder
              ? "Not on Greenroom"
              : "Member"
        }
      >
        {member ? (
          <div className="flex flex-col gap-6" data-testid="member-sheet">
            <div className="flex items-center gap-4">
              <MemberAvatar member={member} className="size-20 text-2xl" />
              <div className="flex min-w-0 flex-col items-start gap-1.5">
                <span className="truncate text-lg font-semibold">
                  {member.displayName}
                </span>
                {member.role === "admin" ? (
                  <Badge variant="secondary">Admin</Badge>
                ) : null}
                {member.isPlaceholder ? (
                  <Badge variant="outline">Not on Greenroom</Badge>
                ) : null}
              </div>
            </div>

            {member.email ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Contact
                </h3>
                <a
                  href={`mailto:${member.email}`}
                  data-testid="member-email"
                  className="flex min-h-11 items-center gap-3 rounded-xl border bg-background px-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{member.email}</span>
                </a>
              </section>
            ) : null}

            {member.notes ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Notes
                </h3>
                <p
                  data-testid="member-notes"
                  className="text-sm whitespace-pre-wrap"
                >
                  {member.notes}
                </p>
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Instruments
              </h3>
              {instruments.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {instruments.map((i) => (
                    <li
                      key={i}
                      className="flex h-9 items-center gap-1.5 rounded-full bg-gig-soft px-3 text-sm font-medium text-gig-soft-foreground"
                    >
                      <InstrumentIcon instrument={i} className="size-4" />
                      {instrumentLabel(i)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No instruments listed.
                </p>
              )}
            </section>

            {canManage ? (
              <section
                className="flex flex-col gap-2 border-t pt-5"
                aria-label="Admin actions"
              >
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Admin actions
                </h3>
                {member.isPlaceholder ? (
                  <Button variant="outline" size="lg" onClick={onEdit}>
                    <Pencil /> Edit details
                  </Button>
                ) : member.role === "admin" ? (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={setRole.isPending}
                    onClick={() => {
                      setError(null);
                      setRole.mutate(
                        { userId: member.userId, role: "member" },
                        { onError: fail },
                      );
                    }}
                  >
                    <ShieldOff /> Remove admin
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={setRole.isPending}
                    onClick={() => {
                      setError(null);
                      setRole.mutate(
                        { userId: member.userId, role: "admin" },
                        { onError: fail },
                      );
                    }}
                  >
                    <ShieldCheck /> Make admin
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="lg"
                  onClick={() => setConfirmRemove(true)}
                >
                  <UserMinus /> Remove from band
                </Button>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        ) : null}
      </RightSheet>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={`Remove ${member?.displayName ?? "member"}?`}
        description="They lose access to this band. Past gigs keep their name in the lineup."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (!member) return;
          setError(null);
          remove.mutate(member.userId, {
            onSuccess: () => onOpenChange(false),
            onError: fail,
          });
        }}
      />
    </>
  );
}
