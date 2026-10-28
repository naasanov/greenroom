"use client";

import { Check, Copy, Link2, Loader2, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UploadLink } from "@greenroom/shared";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatBytes } from "@/components/public-upload/format";
import { isApiError } from "@/lib/api";
import {
  isLinkActive,
  useCreateUploadLink,
  useRevokeUploadLink,
  useUploadLinks,
} from "@/lib/queries/upload-links";
import { cn } from "@/lib/utils";

const EXPIRY_CHOICES = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

const expiryText = (iso: string | null) =>
  iso
    ? `Expires ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
    : "Never expires";

/** Trigger plus dialog for the gig's anonymous upload link. */
export function UploadLinkButton({
  bandId,
  gigId,
}: {
  bandId: string;
  gigId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        className="self-start"
        data-testid="share-upload-link"
        onClick={() => setOpen(true)}
      >
        <Link2 />
        Share upload link
      </Button>
      <UploadLinkDialog
        bandId={bandId}
        gigId={gigId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

export function UploadLinkDialog({
  bandId,
  gigId,
  open,
  onOpenChange,
}: {
  bandId: string;
  gigId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const links = useUploadLinks(bandId, gigId, open);
  const create = useCreateUploadLink(bandId, gigId);
  const revoke = useRevokeUploadLink(bandId, gigId);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [confirming, setConfirming] = useState(false);
  const active = links.data?.find(isLinkActive);
  const notLinked =
    isApiError(create.error, 409) || create.error?.message.includes("Drive");

  async function replace() {
    if (active) await revoke.mutateAsync(active.id);
    create.mutate({ days, fresh: true });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent data-testid="upload-link-dialog">
          <DialogHeader>
            <DialogTitle>Share upload link</DialogTitle>
            <DialogDescription>
              Anyone with the link can add photos and videos to this gig&apos;s
              Unsorted folder. They can&apos;t see anything else.
            </DialogDescription>
          </DialogHeader>

          {links.isPending ? (
            <div className="flex justify-center py-6 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : active ? (
            <ActiveLink
              link={active}
              busy={revoke.isPending || create.isPending}
              onRevoke={() => setConfirming(true)}
              onReplace={replace}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">
                  Link expires after the gig
                </legend>
                <div className="flex gap-2">
                  {EXPIRY_CHOICES.map((c) => (
                    <Button
                      key={c.days}
                      type="button"
                      variant={days === c.days ? "default" : "outline"}
                      aria-pressed={days === c.days}
                      className="flex-1"
                      onClick={() => setDays(c.days)}
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              </fieldset>
              {create.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  {notLinked
                    ? "Link Google Drive for this band before sharing an upload link."
                    : "Could not create the link. Please try again."}
                </p>
              ) : null}
              <Button
                disabled={create.isPending}
                data-testid="create-upload-link"
                onClick={() => create.mutate({ days })}
              >
                {create.isPending ? <Loader2 className="animate-spin" /> : null}
                Create link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Turn off this link?"
        description="People with the link will no longer be able to upload. Files already uploaded stay in the gig."
        confirmLabel="Turn off link"
        destructive
        onConfirm={() => active && revoke.mutate(active.id)}
      />
    </>
  );
}

function ActiveLink({
  link,
  busy,
  onRevoke,
  onReplace,
}: {
  link: UploadLink;
  busy: boolean;
  onRevoke: () => void;
  onReplace: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    try {
      await navigator.share({
        title: "Upload your photos and videos",
        url: link.url,
      });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) throw e;
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="upload-link-active">
      <div className="flex gap-2">
        <Input
          readOnly
          value={link.url}
          aria-label="Upload link"
          data-testid="upload-link-url"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1"
        />
        <Button onClick={copy} data-testid="copy-upload-link">
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {canShare ? (
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Share"
            onClick={share}
          >
            <Share2 />
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">
        {expiryText(link.expiresAt)}.{" "}
        <span data-testid="upload-link-usage">
          {link.uploadsCount === 0
            ? "No uploads yet."
            : `${link.uploadsCount} ${link.uploadsCount === 1 ? "file" : "files"} (${formatBytes(link.bytesUsed)}) uploaded.`}
        </span>
      </p>
      <div className={cn("flex flex-wrap gap-2")}>
        <Button
          variant="outline"
          disabled={busy}
          onClick={onReplace}
          data-testid="new-upload-link"
        >
          Create a new link
        </Button>
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={busy}
          onClick={onRevoke}
          data-testid="revoke-upload-link"
        >
          Turn off link
        </Button>
      </div>
    </div>
  );
}
