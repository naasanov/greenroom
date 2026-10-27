"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { tabPath, useLastTab } from "@/components/app/routed-shell";
import { GoogleLinkReturn } from "@/components/google/google-link-return";
import { BandSection } from "@/components/settings/band-section";
import { LeaveBandSection } from "@/components/settings/leave-band-section";
import { PersonalSection } from "@/components/settings/personal-section";
import { Button } from "@/components/ui/button";
import { useCurrentBand } from "@/lib/current-band";
import { useMe } from "@/lib/queries";

/** Settings page: personal account for everyone, band profile for admins, leave for all. */
export function SettingsView() {
  const me = useMe().data;
  const { currentBand } = useCurrentBand();
  const lastTab = useLastTab();
  if (!me) return null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-5 pb-10">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Back" asChild>
          <Link href={tabPath(lastTab ?? "events")}>
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </div>

      {currentBand ? <GoogleLinkReturn bandId={currentBand.id} /> : null}
      <PersonalSection user={me} />
      {currentBand?.role === "admin" ? (
        <BandSection key={currentBand.id} band={currentBand} />
      ) : null}
      {currentBand ? (
        <LeaveBandSection key={currentBand.id} band={currentBand} />
      ) : null}
    </div>
  );
}
