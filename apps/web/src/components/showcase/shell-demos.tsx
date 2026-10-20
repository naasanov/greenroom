"use client";

import {
  FolderInput,
  ListMusic,
  Pencil,
  Plus,
  Trash2,
  Check,
} from "lucide-react";
import { useState } from "react";
import { AppShell, type TabKey } from "@/components/app/app-shell";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { toneFor, type ShellLayout } from "@/components/app/event-types";
import { Fab } from "@/components/app/fab";
import { AgendaCard, TodayLine } from "@/components/app/event-views";
import { ListCard } from "@/components/app/list-card";
import { SelectionBar } from "@/components/app/selection-bar";
import { Demo, Frame, Section } from "@/components/showcase/section";
import {
  AGENDA,
  ATTENDEES,
  BANDS,
  SONGS,
} from "@/components/showcase/sample-data";
import { InstrumentIcon } from "@/components/app/instruments";
import { cn } from "@/lib/utils";

function ShellDemo({
  layout,
  testId,
  initialTab,
}: {
  layout: ShellLayout;
  testId: string;
  initialTab: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [band, setBand] = useState(BANDS[0].id);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <Frame
      testId={testId}
      className={cn(layout === "mobile" && "mx-auto max-w-[390px]")}
    >
      <AppShell
        placement="contained"
        layout={layout}
        bands={BANDS}
        activeBandId={band}
        onBandChange={setBand}
        onCreateBand={() => setToast("Create another band")}
        activeTab={tab}
        onTabChange={setTab}
        profile={{ name: "Ava" }}
        onProfileClick={() => setToast("Profile and settings")}
      >
        <div
          className="mx-auto flex max-w-2xl flex-col gap-2.5 p-3 pb-24"
          data-testid={`${testId}-content`}
        >
          {tab === "calendar" ? (
            <>
              <AgendaCard {...AGENDA[1]} timeZone="UTC" past />
              <TodayLine />
              {AGENDA.slice(2, 5).map((e) => (
                <AgendaCard key={e.id} {...e} timeZone="UTC" />
              ))}
            </>
          ) : null}
          {tab === "library"
            ? SONGS.map((s) => (
                <ListCard
                  key={s.id}
                  title={s.title}
                  subtitle={s.artist}
                  meta={s.duration}
                  onClick={() => {}}
                />
              ))
            : null}
          {tab === "roster"
            ? ATTENDEES.map((a) => (
                <ListCard
                  key={a.id}
                  title={a.name}
                  subtitle={(a.instruments ?? []).join(", ")}
                  thumbnailIcon={
                    <InstrumentIcon
                      instrument={a.instruments?.[0] ?? "other"}
                      className="size-6"
                    />
                  }
                  onClick={() => {}}
                />
              ))
            : null}
        </div>
      </AppShell>

      {tab === "calendar" ? (
        <Fab
          placement="contained"
          layout={layout}
          label="Add event"
          onClick={() => setToast("Open event drawer")}
        />
      ) : null}
      {tab === "library" ? (
        <Fab
          placement="contained"
          layout={layout}
          label="Add to library"
          actions={[
            {
              key: "song",
              label: "Add song",
              icon: <Plus />,
              onSelect: () => setToast("Add song"),
            },
            {
              key: "playlist",
              label: "Import playlist",
              icon: <ListMusic />,
              onSelect: () => setToast("Import playlist"),
            },
          ]}
        />
      ) : null}
      {toast ? (
        <button
          type="button"
          data-testid={`${testId}-toast`}
          onClick={() => setToast(null)}
          className="absolute inset-x-0 top-16 z-40 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lift"
        >
          {toast}
        </button>
      ) : null}
    </Frame>
  );
}

export function ShellSection() {
  return (
    <Section
      id="shell"
      title="App shell and FAB"
      description="Band switcher and profile on top; tabs along the top on desktop and a bottom bar on mobile. Presentational only, routing comes later. The FAB floats above the tab bar; on Music Library it opens a speed dial."
    >
      <Demo
        title="Follows your viewport"
        note="Resize the window or open on a phone. Try the band switcher and the tabs."
      >
        <ShellDemo
          layout="responsive"
          testId="shell-auto"
          initialTab="calendar"
        />
      </Demo>
      <Demo
        title="Phone layout (forced)"
        note="Music Library tab: tap + for the speed dial."
      >
        <ShellDemo layout="mobile" testId="shell-mobile" initialTab="library" />
      </Demo>
    </Section>
  );
}

const MEDIA = Array.from({ length: 8 }, (_, i) => ({
  id: `m${i}`,
  name: [
    "IMG_2041.jpg",
    "soundcheck.mov",
    "poster.png",
    "crowd-wide.jpg",
    "backstage.jpg",
    "encore.mov",
    "setlist-photo.jpg",
    "IMG_2050.jpg",
  ][i],
}));

export function SelectionSection() {
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [last, setLast] = useState("none yet");
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );

  return (
    <Section
      id="selection"
      title="Selection action bar"
      description="Tap thumbnails to select. Move and cancel work for any number; rename only appears when exactly one item is selected."
    >
      <Demo title="Media selection" note={`Last action: ${last}`}>
        <Frame className="h-[26rem]" testId="selection-frame">
          <div className="grid h-full grid-cols-3 content-start gap-3 overflow-y-auto p-4 pb-28 sm:grid-cols-4">
            {MEDIA.map((m) => {
              const on = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  data-testid="media-tile"
                  onClick={() => toggle(m.id)}
                  className="flex flex-col gap-1 text-left outline-none"
                >
                  <span
                    className={cn(
                      "relative flex aspect-square items-center justify-center rounded-2xl transition-all",
                      toneFor(m.id),
                      on && "scale-95 ring-3 ring-primary",
                    )}
                  >
                    {on ? (
                      <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" strokeWidth={3} />
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m.name}
                  </span>
                </button>
              );
            })}
          </div>
          <SelectionBar
            placement="contained"
            count={selected.length}
            onClear={() => setSelected([])}
            actions={[
              {
                key: "move",
                label: "Move",
                icon: <FolderInput />,
                onSelect: () => setLast(`move ${selected.length}`),
              },
              {
                key: "rename",
                label: "Rename",
                icon: <Pencil />,
                when: "single",
                onSelect: () => setLast("rename 1"),
              },
              {
                key: "cancel",
                label: "Cancel",
                icon: <Trash2 />,
                destructive: true,
                onSelect: () => setConfirm(true),
              },
            ]}
          />
        </Frame>
      </Demo>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Cancel ${selected.length} upload${selected.length === 1 ? "" : "s"}?`}
        description="Files already uploaded stay in the gig."
        confirmLabel="Cancel uploads"
        cancelLabel="Keep going"
        destructive
        onConfirm={() => {
          setLast(`cancelled ${selected.length}`);
          setSelected([]);
          setConfirm(false);
        }}
      />
    </Section>
  );
}
