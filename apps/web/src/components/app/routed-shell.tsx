"use client";

import dynamic from "next/dynamic";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
import { prefetchFiles } from "@/lib/files-prefetch";
import { useMe, useSignOut } from "@/lib/queries";

/** Calendar-shaped placeholder that holds the Events tab's space while its code loads. */
function EventsSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-5xl px-3 py-4 pb-28"
    >
      <div className="mb-3 h-9 w-48 animate-pulse rounded-xl bg-muted" />
      <div className="h-[34rem] animate-pulse rounded-2xl bg-muted/60" />
    </div>
  );
}

const EventsTab = dynamic(
  () => import("@/components/events/events-tab").then((m) => m.EventsTab),
  { ssr: false, loading: () => <EventsSkeleton /> },
);

export function tabPath(tab: TabKey): string {
  return `/${tab}`;
}

function tabFromPath(pathname: string): TabKey | null {
  const seg = pathname.split("/")[1];
  if (
    seg === "events" ||
    seg === "library" ||
    seg === "files" ||
    seg === "roster"
  )
    return seg;
  // Deep links highlight the tab their resource lives in.
  if (seg === "gigs" || seg === "practices") return "events";
  if (seg === "songs") return "library";
  return null;
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
  const qc = useQueryClient();
  const bandId = currentBand?.id;
  const warmFiles = useCallback(() => {
    if (!bandId) return;
    prefetchFiles(qc, bandId);
    router.prefetch("/files");
  }, [qc, bandId, router]);
  // Files chunk and root listing load at idle so the first visit opens warm.
  useEffect(() => {
    if (!bandId) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (!w.requestIdleCallback) {
      const t = window.setTimeout(warmFiles, 2000);
      return () => window.clearTimeout(t);
    }
    const id = w.requestIdleCallback(warmFiles);
    return () => w.cancelIdleCallback?.(id);
  }, [bandId, warmFiles]);
  const activeTab = tabFromPath(pathname);
  // Event deep links share one Events tab; once visited it stays mounted (hidden
  // off-tab) so returning never rebuilds the calendar.
  const showEvents = activeTab === "events";
  const [eventsVisited, setEventsVisited] = useState(false);
  if (showEvents && !eventsVisited) setEventsVisited(true);
  if (activeTab && activeTab !== lastTab) setLastTab(activeTab);

  if (!currentBand || !me) {
    return (
      <StartScreen
        name={me?.displayName ?? ""}
        onCreated={() => {}}
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
        onBandSettings={() => router.push("/settings#settings-band")}
        activeTab={activeTab}
        tabHref={tabPath}
        onTabIntent={(tab) => {
          if (tab === "files") warmFiles();
        }}
        profile={{ name: me.displayName, imageUrl: me.avatarUrl }}
        onProfileClick={() => router.push("/settings")}
      >
        {eventsVisited ? (
          <div hidden={!showEvents}>
            <Suspense>
              <EventsTab active={showEvents} />
            </Suspense>
          </div>
        ) : null}
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
            onCreated={() => {
              setCreateOpen(false);
              router.push("/events");
            }}
          />
        </DialogContent>
      </Dialog>
    </LastTabContext.Provider>
  );
}
