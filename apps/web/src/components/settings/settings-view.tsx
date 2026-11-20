"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  bandSettingsPath,
  tabPath,
  useLastTab,
} from "@/components/app/routed-shell";
import { GoogleLinkReturn } from "@/components/google/google-link-return";
import { ConnectionsSection } from "@/components/settings/connections-section";
import { DeleteAccountSection } from "@/components/settings/delete-account-section";
import {
  PersonalSection,
  ProfileFormProvider,
  SaveProfileBar,
} from "@/components/settings/personal-section";
import {
  SettingsPanel,
  SettingsTabBar,
  useSettingsTab,
} from "@/components/settings/settings-tabs";
import { Button } from "@/components/ui/button";
import { useCurrentBand } from "@/lib/current-band";
import { useMe } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Settings page split into Profile and Connections tabs. The retired
 * `?tab=band` URL forwards to the active band's settings page.
 */
export function SettingsView() {
  const me = useMe().data;
  const { currentBand } = useCurrentBand();
  const lastTab = useLastTab();
  const [requested, setTab] = useSettingsTab();
  const router = useRouter();
  const legacyBandTab = useSearchParams().get("tab") === "band";
  const bandId = currentBand?.id;
  useEffect(() => {
    if (legacyBandTab && bandId) router.replace(bandSettingsPath(bandId));
  }, [legacyBandTab, bandId, router]);
  if (!me || (legacyBandTab && bandId)) return null;
  const isAdmin = currentBand?.role === "admin";
  const tab = currentBand ? requested : "profile";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-5 pb-10 md:max-w-4xl">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Back" asChild>
          <Link href={tabPath(lastTab ?? "events")}>
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </div>

      {currentBand ? <GoogleLinkReturn bandId={currentBand.id} /> : null}
      <div
        className={cn(
          "flex flex-col gap-6",
          currentBand &&
            "md:grid md:grid-cols-[12rem_1fr] md:items-start md:gap-8",
        )}
      >
        {currentBand ? <SettingsTabBar active={tab} onChange={setTab} /> : null}
        <div
          className={cn(
            "flex flex-col gap-6",
            currentBand && "md:col-start-2 md:row-start-1 md:max-w-xl",
          )}
        >
          <SettingsPanel tab="profile" active={tab === "profile"}>
            <ProfileFormProvider user={me}>
              <PersonalSection user={me} />
              <DeleteAccountSection />
              <SaveProfileBar />
            </ProfileFormProvider>
          </SettingsPanel>
          {currentBand ? (
            <>
              <SettingsPanel tab="connections" active={tab === "connections"}>
                <ConnectionsSection
                  user={me}
                  bandId={currentBand.id}
                  isAdmin={isAdmin}
                />
              </SettingsPanel>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
