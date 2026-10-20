"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BandSummary } from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInviteLink, useResetInvite } from "@/lib/queries";

/** Invite link with copy, native share on touch devices, and admin-only reset. */
export function InviteDrawer({
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const url = invite.data?.url ?? "";
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked: the field stays selectable for a manual copy.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
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
          <div className={canShare ? "grid grid-cols-2 gap-2" : "grid gap-2"}>
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
