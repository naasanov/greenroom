"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { tabPath, useLastTab } from "@/components/app/routed-shell";
import { BandSection } from "@/components/settings/band-section";
import { LeaveBandSection } from "@/components/settings/leave-band-section";
import { Button } from "@/components/ui/button";
import { useCurrentBand } from "@/lib/current-band";

/** Settings for one band the user belongs to; edit controls are admin-only. */
export function BandSettingsView({ bandId }: { bandId: string }) {
  const { bands } = useCurrentBand();
  const lastTab = useLastTab();
  const band = bands.find((b) => b.id === bandId);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-5 pb-10">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Back" asChild>
          <Link href={tabPath(lastTab ?? "events")}>
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col">
          <h1 className="text-xl font-semibold tracking-tight">
            Band settings
          </h1>
          {band ? (
            <p
              data-testid="band-settings-name"
              className="truncate text-sm text-muted-foreground"
            >
              {band.name}
            </p>
          ) : null}
        </div>
      </div>

      {band ? (
        <>
          {band.role === "admin" ? (
            <BandSection key={band.id} band={band} />
          ) : null}
          <LeaveBandSection key={band.id} band={band} />
        </>
      ) : (
        <p role="alert" className="text-sm text-muted-foreground">
          You are not a member of this band.
        </p>
      )}
    </div>
  );
}
