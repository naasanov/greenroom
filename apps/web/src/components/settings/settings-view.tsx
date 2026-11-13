"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { tabPath, useLastTab } from "@/components/app/routed-shell";
import { GoogleLinkReturn } from "@/components/google/google-link-return";
import { BandSection } from "@/components/settings/band-section";
import { ConnectionsSection } from "@/components/settings/connections-section";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";
import { LeaveBandSection } from "@/components/settings/leave-band-section";
import { PersonalSection } from "@/components/settings/personal-section";
import {
  SettingsPanel,
  SettingsTabBar,
  useSettingsTab,
} from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { useCurrentBand } from "@/lib/current-band";
import { useMe } from "@/lib/queries";

/** Settings page split into Profile, Band, and Connections tabs. */
export function SettingsView() {
  const me = useMe().data;
  const { currentBand } = useCurrentBand();
  const lastTab = useLastTab();
  const [requested, setTab] = useSettingsTab();
  if (!me) return null;
  const isAdmin = currentBand?.role === "admin";
  const tab = currentBand ? requested : "profile";

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
      {currentBand ? <SettingsTabBar active={tab} onChange={setTab} /> : null}

      <SettingsPanel tab="profile" active={tab === "profile"}>
        <PersonalSection user={me} bandId={currentBand?.id} />
        <DeleteAccountSection />
      </SettingsPanel>
      {currentBand ? (
        <>
          <SettingsPanel tab="band" active={tab === "band"}>
            {isAdmin ? (
              <BandSection key={currentBand.id} band={currentBand} />
            ) : null}
            <LeaveBandSection key={currentBand.id} band={currentBand} />
          </SettingsPanel>
          <SettingsPanel tab="connections" active={tab === "connections"}>
            <ConnectionsSection bandId={currentBand.id} isAdmin={isAdmin} />
          </SettingsPanel>
        </>
      ) : null}
    </div>
  );
}
