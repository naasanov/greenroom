"use client";

import { Calendar, ListMusic } from "lucide-react";
import { useState } from "react";
import { AppShell, type TabKey } from "@/components/app/app-shell";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateBandForm } from "@/components/onboarding/create-band-form";
import { RosterTab } from "@/components/onboarding/roster-tab";
import { StartScreen } from "@/components/onboarding/start-screen";
import { useCurrentBand } from "@/lib/current-band";
import { useMe, useSignOut } from "@/lib/queries";

const PLACEHOLDERS = {
  events: {
    icon: Calendar,
    title: "Events",
    description: "Gigs and practices will live here soon.",
  },
  library: {
    icon: ListMusic,
    title: "Music Library",
    description: "Your band's songs and setlists will live here soon.",
  },
} as const;

/** App home: the start screen with no bands, otherwise the shell with tab content. */
export function HomeView() {
  const { bands, currentBand, setCurrentBandId } = useCurrentBand();
  const me = useMe().data;
  const signOut = useSignOut();
  const [tab, setTab] = useState<TabKey>("events");
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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
    <>
      <AppShell
        bands={bands.map((b) => ({
          id: b.id,
          name: b.name,
          imageUrl: b.photoUrl,
        }))}
        activeBandId={currentBand.id}
        onBandChange={setCurrentBandId}
        onCreateBand={() => setCreateOpen(true)}
        activeTab={tab}
        onTabChange={setTab}
        profile={{ name: me.displayName, imageUrl: me.avatarUrl }}
        onProfileClick={() => setProfileOpen(true)}
      >
        {tab === "roster" ? (
          <RosterTab band={currentBand} />
        ) : (
          <EmptyState className="py-24" {...PLACEHOLDERS[tab]} />
        )}
      </AppShell>

      <BottomDrawer
        open={profileOpen}
        onOpenChange={setProfileOpen}
        title="Your account"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col">
            <span className="font-semibold">{me.displayName}</span>
            <span className="text-sm text-muted-foreground">{me.email}</span>
          </div>
          <Button
            variant="outline"
            size="lg"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
          >
            Sign out
          </Button>
        </div>
      </BottomDrawer>

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
              setTab("events");
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
