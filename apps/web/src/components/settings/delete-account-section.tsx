"use client";

import Link from "next/link";
import { useState } from "react";
import { ACCOUNT_ERROR_CODES, type AccountBand } from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { SectionCard } from "@/components/settings/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrentBand } from "@/lib/current-band";
import { isApiError } from "@/lib/api";
import { useDeleteAccount, useDeletionPreview } from "@/lib/queries/account";

function BandList({ title, bands }: { title: string; bands: AccountBand[] }) {
  if (bands.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        {bands.map((b) => (
          <li key={b.id}>{b.name}</li>
        ))}
      </ul>
    </div>
  );
}

/** Danger zone: delete the account after previewing its effect and typing DELETE. */
export function DeleteAccountSection() {
  const { setCurrentBandId } = useCurrentBand();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const preview = useDeletionPreview(open);
  const remove = useDeleteAccount();
  const blocked = preview.data?.blockedBands ?? [];

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  async function run() {
    setError(null);
    try {
      await remove.mutateAsync({ confirm: "DELETE" });
    } catch (e) {
      if (isApiError(e, 409) && e.code === ACCOUNT_ERROR_CODES.lastAdmin) {
        void preview.refetch();
      } else {
        setError("We could not delete your account. Please try again.");
      }
    }
  }

  return (
    <SectionCard
      id="settings-danger"
      title="Danger zone"
      testId="settings-danger"
      className="border-destructive/40"
    >
      <p className="text-sm text-muted-foreground">
        Permanently delete your account and leave all of your bands.
      </p>
      <Button variant="destructive" size="lg" onClick={() => setOpen(true)}>
        Delete account
      </Button>

      <BottomDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Delete account?"
        description="This cannot be undone."
      >
        <div className="flex flex-col gap-4 pt-2">
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>You will leave all of your bands.</li>
            <li>Bands where you are the only member will be deleted.</li>
            <li>Files in Google Drive are not deleted.</li>
            <li>Your past lineups keep your name.</li>
          </ul>

          {preview.isError ? (
            <p role="alert" className="text-sm text-destructive">
              We could not check your bands. Please try again.
            </p>
          ) : null}
          {preview.data ? (
            <>
              <BandList
                title="Bands that will be deleted"
                bands={preview.data.deleteBands}
              />
              <BandList
                title="Bands you will leave"
                bands={preview.data.leaveBands}
              />
            </>
          ) : null}

          {blocked.length > 0 ? (
            <div
              role="alert"
              data-testid="delete-account-blocked"
              className="flex flex-col gap-1 rounded-2xl border border-destructive/40 p-3 text-sm"
            >
              <p className="font-medium text-destructive">
                Make someone else an admin first
              </p>
              <p className="text-muted-foreground">
                You are the last admin of these bands, and they have other
                members.
              </p>
              <ul className="list-disc pl-5">
                {blocked.map((b) => (
                  <li key={b.id}>
                    <Link
                      href="/roster"
                      className="underline"
                      onClick={() => {
                        setCurrentBandId(b.id);
                        onOpenChange(false);
                      }}
                    >
                      {b.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Input
            aria-label="Type DELETE to confirm"
            placeholder="DELETE"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            variant="danger"
            size="lg"
            disabled={
              typed !== "DELETE" ||
              !preview.data ||
              blocked.length > 0 ||
              remove.isPending
            }
            onClick={() => void run()}
          >
            {remove.isPending ? "Deleting..." : "Delete my account"}
          </Button>
        </div>
      </BottomDrawer>
    </SectionCard>
  );
}
