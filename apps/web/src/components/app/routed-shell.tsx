"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { AppShell, type TabKey } from "@/components/app/app-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateBandForm } from "@/components/onboarding/create-band-form";
import { StartScreen } from "@/components/onboarding/start-screen";
import { useCurrentBand } from "@/lib/current-band";
import { useMe, useSignOut } from "@/lib/queries";

export function tabPath(tab: TabKey): string {
  return `/${tab}`;
}

function tabFromPath(pathname: string): TabKey | null {
  const seg = pathname.split("/")[1];
  return seg === "events" || seg === "library" || seg === "roster" ? seg : null;
}

const LastTabContext = createContext<TabKey | null>(null);

/** The most recently visited tab, for back controls on pages outside the tabs. */
export function useLastTab(): TabKey | null {
  return useContext(LastTabContext);
}

/** Start screen with no bands; otherwise the shell around the current route. */
export function RoutedShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { bands, currentBand, setCurrentBandId } = useCurrentBand();
  const me = useMe().data;
  const signOut = useSignOut();
  const [createOpen, setCreateOpen] = useState(false);
  const [lastTab, setLastTab] = useState<TabKey | null>(null);
  const activeTab = tabFromPath(pathname);
  if (activeTab && activeTab !== lastTab) setLastTab(activeTab);

  if (!currentBand || !me) {
    return (
      <StartScreen
        name={me?.displayName ?? ""}
        onCreated={(band) => setCurrentBandId(band.id)}
        onSignOut={() => signOut.mutate()}
      />
    );
  }

  return (
    <LastTabContext.Provider value={lastTab}>
      <AppShell
        bands={bands.map((b) => ({
          id: b.id,
          name: b.name,
          imageUrl: b.photoUrl,
        }))}
        activeBandId={currentBand.id}
        onBandChange={setCurrentBandId}
        onCreateBand={() => setCreateOpen(true)}
        activeTab={activeTab}
        tabHref={tabPath}
        profile={{ name: me.displayName, imageUrl: me.avatarUrl }}
        onProfileClick={() => router.push("/settings")}
      >
        {children}
      </AppShell>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Create another band
            </DialogTitle>
            <DialogDescription>
              Joining a band instead? Open the invite link your bandmate sent
              you.
            </DialogDescription>
          </DialogHeader>
          <CreateBandForm
            idPrefix="another-band"
            onCreated={(band) => {
              setCurrentBandId(band.id);
              setCreateOpen(false);
              router.push("/events");
            }}
          />
        </DialogContent>
      </Dialog>
    </LastTabContext.Provider>
  );
}
