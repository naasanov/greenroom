"use client";

import { CalendarDays, Check, Library, Mic2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BottomDrawer, SideDrawer } from "@/components/app/bottom-drawer";
import {
  ConfirmDialog,
  DiscardChangesDialog,
  EditScopeDialog,
  type EditScope,
} from "@/components/app/confirm-dialogs";
import { FormField } from "@/components/app/form-field";
import { LinkList, type LinkRow } from "@/components/app/link-list";
import { ListCard } from "@/components/app/list-card";
import { RightSheet } from "@/components/app/right-sheet";
import { SplitDrawer } from "@/components/app/split-drawer";
import { Demo, Section } from "@/components/showcase/section";
import { SONGS, type Song } from "@/components/showcase/sample-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function PracticeForm() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <FormField label="Title" htmlFor="pf-title">
        <Input id="pf-title" defaultValue="Practice" />
      </FormField>
      <FormField label="Location" htmlFor="pf-loc">
        <Input id="pf-loc" placeholder="Jonas's garage" />
      </FormField>
      <Button size="lg">Save practice</Button>
    </div>
  );
}

function GigForm() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <FormField label="Title" htmlFor="gf-title">
        <Input id="gf-title" placeholder="Where are we playing?" />
      </FormField>
      <FormField label="Date" htmlFor="gf-date">
        <Input id="gf-date" type="date" />
      </FormField>
      <Button size="lg">Save gig</Button>
    </div>
  );
}

export function DrawersSection() {
  const [basic, setBasic] = useState(false);
  const [nested, setNested] = useState(false);
  const [inner, setInner] = useState(false);
  const [split, setSplit] = useState(false);
  const [gig, setGig] = useState(false);
  const [library, setLibrary] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  const [dirty, setDirty] = useState("");
  const [discard, setDiscard] = useState(false);
  const [guarded, setGuarded] = useState(false);

  const toggleSong = (id: string) =>
    setAdded((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <Section
      id="drawers"
      title="Drawers"
      description="Bottom drawers are for creating or editing one thing: thumb reachable, drag the handle or tap outside to dismiss."
    >
      <Demo title="Bottom drawer and stacking" className="flex flex-wrap gap-3">
        <Button onClick={() => setBasic(true)}>Open drawer</Button>
        <Button variant="secondary" onClick={() => setNested(true)}>
          Open stacked drawers
        </Button>
        <Button variant="secondary" onClick={() => setGuarded(true)}>
          Drawer with discard guard
        </Button>
      </Demo>
      <Demo
        title="Split drawer"
        note="Tap a half to slide to it. Back arrow or swipe returns to the split."
      >
        <Button onClick={() => setSplit(true)}>Open split drawer</Button>
      </Demo>
      <Demo
        title="Side-by-side and over drawers"
        note="Add songs opens a thin library drawer: beside the main drawer on desktop, over it on narrow screens."
      >
        <Button onClick={() => setGig(true)}>New gig</Button>
      </Demo>

      <BottomDrawer
        open={basic}
        onOpenChange={setBasic}
        title="Quick note"
        description="A basic bottom drawer with a footer."
        footer={
          <Button size="lg" className="w-full" onClick={() => setBasic(false)}>
            Save
          </Button>
        }
      >
        <FormField label="Note" htmlFor="qn">
          <Textarea id="qn" placeholder="Anything the band should know" />
        </FormField>
      </BottomDrawer>

      <BottomDrawer
        open={nested}
        onOpenChange={setNested}
        title="Gig details"
        description="Open a second drawer on top of this one."
      >
        <div className="flex flex-col gap-4 py-2">
          <FormField label="Title" htmlFor="nd-title">
            <Input id="nd-title" defaultValue="Halloween Bash" />
          </FormField>
          <Button variant="secondary" onClick={() => setInner(true)}>
            Choose a venue
          </Button>
        </div>
        <BottomDrawer
          nested
          open={inner}
          onOpenChange={setInner}
          title="Choose a venue"
        >
          <ul className="flex flex-col gap-2.5 py-2">
            {["The Echo Lounge", "Riverside Park", "Wildflower Brewing"].map(
              (v) => (
                <li key={v}>
                  <ListCard title={v} onClick={() => setInner(false)} />
                </li>
              ),
            )}
          </ul>
        </BottomDrawer>
      </BottomDrawer>

      <BottomDrawer
        open={guarded}
        onOpenChange={setGuarded}
        title="New gig"
        dismissible={!dirty}
        onDismissAttempt={() => setDiscard(true)}
      >
        <div className="py-2">
          <FormField
            label="Title"
            htmlFor="gd-title"
            hint="Type something, then close the drawer."
          >
            <Input
              id="gd-title"
              value={dirty}
              onChange={(e) => setDirty(e.target.value)}
              placeholder="Gig title"
            />
          </FormField>
        </div>
        <DiscardChangesDialog
          open={discard}
          onOpenChange={setDiscard}
          onDiscard={() => {
            setDirty("");
            setDiscard(false);
            setGuarded(false);
          }}
        />
      </BottomDrawer>

      <SplitDrawer
        open={split}
        onOpenChange={setSplit}
        title="New event"
        left={{
          label: "Practice",
          hint: "Recurring rehearsal",
          icon: <CalendarDays />,
          tone: "practice",
          title: "New practice",
          content: <PracticeForm />,
        }}
        right={{
          label: "Gig",
          hint: "A show with a setlist",
          icon: <Mic2 />,
          tone: "gig",
          title: "New gig",
          content: <GigForm />,
        }}
      />

      <BottomDrawer
        open={gig}
        onOpenChange={(o) => {
          setGig(o);
          if (!o) setLibrary(false);
        }}
        title="New gig"
        tall
        aside={
          <SideDrawer
            open={library}
            onOpenChange={setLibrary}
            title="Song library"
          >
            <ul className="flex flex-col gap-2.5 pt-1">
              {SONGS.map((s) => (
                <li key={s.id}>
                  <ListCard
                    title={s.title}
                    subtitle={s.artist}
                    meta={s.duration}
                    checked={added.includes(s.id)}
                    onClick={() => toggleSong(s.id)}
                  />
                </li>
              ))}
            </ul>
          </SideDrawer>
        }
      >
        <div className="flex flex-col gap-5 py-2">
          <FormField label="Title" htmlFor="ng-title">
            <Input id="ng-title" placeholder="Where are we playing?" />
          </FormField>
          <div className="flex flex-col gap-2.5">
            <p className="text-sm font-medium">Setlist</p>
            {added.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                No songs yet.
              </p>
            ) : (
              SONGS.filter((s) => added.includes(s.id)).map((s) => (
                <ListCard
                  key={s.id}
                  title={s.title}
                  subtitle={s.artist}
                  meta={s.duration}
                  draggable
                />
              ))
            )}
            <Button variant="secondary" onClick={() => setLibrary(true)}>
              <Library /> Add songs
            </Button>
          </div>
        </div>
      </BottomDrawer>
    </Section>
  );
}

function SongDetail({
  song,
  editing,
  onDelete,
}: {
  song: Song | null;
  editing: boolean;
  onDelete: () => void;
}) {
  const [links, setLinks] = useState<LinkRow[]>(song?.links ?? []);
  // Inputs stay mounted in both modes; read mode only hides the field chrome.
  const ro = !editing;
  const field = cn(
    "transition-colors",
    ro &&
      "border-transparent bg-transparent px-0 shadow-none dark:bg-transparent",
  );
  return (
    <div className="flex flex-col gap-5">
      <FormField label="Title" htmlFor="sd-title">
        <Input
          id="sd-title"
          readOnly={ro}
          defaultValue={song?.title ?? ""}
          placeholder="Song title"
          className={field}
        />
      </FormField>
      <FormField label="Artist" htmlFor="sd-artist">
        <Input
          id="sd-artist"
          readOnly={ro}
          defaultValue={song?.artist ?? ""}
          placeholder="Artist"
          className={field}
        />
      </FormField>
      <FormField label="Notes" htmlFor="sd-notes">
        <Textarea
          id="sd-notes"
          readOnly={ro}
          defaultValue={song?.notes ?? ""}
          placeholder="Capo, tuning, cues"
          className={field}
        />
      </FormField>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Reference</p>
        <LinkList rows={links} onChange={setLinks} editing={editing} />
      </div>
      {editing && song ? (
        <Button variant="destructive" onClick={onDelete} className="self-start">
          <Trash2 /> Delete song
        </Button>
      ) : null}
    </div>
  );
}

export function SheetSection() {
  // index -1 is the "add song" sheet, null is closed.
  const [index, setIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const open = index !== null;
  const song = index !== null && index >= 0 ? SONGS[index] : null;

  const show = (i: number) => {
    setIndex(i);
    setEditing(i === -1);
  };

  return (
    <Section
      id="sheet"
      title="Right-side sheet"
      description="Full-screen on mobile. On desktop it is a panel that stays open while you click other songs. Edit toggles in place without layout shift."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_1fr]">
        <Demo title="Songs" className="flex flex-col gap-2.5">
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => show(-1)}
          >
            <Plus /> Add song (empty, edit mode)
          </Button>
          {SONGS.map((s, i) => (
            <ListCard
              key={s.id}
              title={s.title}
              subtitle={s.artist}
              meta={s.duration}
              selected={index === i}
              onClick={() => show(i)}
            />
          ))}
        </Demo>
      </div>
      <RightSheet
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setIndex(null);
            setEditing(false);
          }
        }}
        title={song?.title ?? "New song"}
        subtitle={song?.artist}
        onPrevious={
          index !== null && index > 0 ? () => show(index - 1) : undefined
        }
        onNext={
          index !== null && index >= 0 && index < SONGS.length - 1
            ? () => show(index + 1)
            : undefined
        }
        canPrevious={index !== null && index > 0}
        canNext={index !== null && index >= 0 && index < SONGS.length - 1}
        editable={index !== -1}
        editing={editing}
        onEditingChange={setEditing}
        headerSlot={
          index === -1 ? (
            <Button className="w-[5.5rem]" onClick={() => setIndex(null)}>
              <Check /> Done
            </Button>
          ) : undefined
        }
      >
        <SongDetail
          key={`${index}-${editing}`}
          song={song}
          editing={editing}
          onDelete={() => setConfirmDelete(true)}
        />
      </RightSheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this song?"
        description="This is in 3 setlists. It will be removed from all of them."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          setIndex(null);
          setEditing(false);
        }}
      />
    </Section>
  );
}

export function DialogsSection() {
  const [which, setWhich] = useState<
    "confirm" | "destructive" | "discard" | "scope" | null
  >(null);
  const [result, setResult] = useState("none yet");
  const close = (o: boolean) => !o && setWhich(null);
  return (
    <Section id="dialogs" title="Dialogs">
      <Demo
        title="Confirm, destructive, discard, edit scope"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setWhich("confirm")}>
            Confirm
          </Button>
          <Button variant="secondary" onClick={() => setWhich("destructive")}>
            Destructive
          </Button>
          <Button variant="secondary" onClick={() => setWhich("discard")}>
            Discard changes
          </Button>
          <Button variant="secondary" onClick={() => setWhich("scope")}>
            Edit scope
          </Button>
        </div>
        <p
          className="text-sm text-muted-foreground"
          data-testid="dialog-result"
        >
          Last result: {result}
        </p>
      </Demo>
      <ConfirmDialog
        open={which === "confirm"}
        onOpenChange={close}
        title="Send invite?"
        description="Everyone in the band gets an email."
        confirmLabel="Send"
        onConfirm={() => setResult("confirmed")}
      />
      <ConfirmDialog
        open={which === "destructive"}
        onOpenChange={close}
        title="Cancel this gig?"
        description="Members will be notified and it is removed from Google Calendar."
        confirmLabel="Cancel gig"
        cancelLabel="Keep gig"
        destructive
        onConfirm={() => setResult("destructive confirmed")}
      />
      <DiscardChangesDialog
        open={which === "discard"}
        onOpenChange={close}
        onDiscard={() => setResult("discarded")}
      />
      <EditScopeDialog
        open={which === "scope"}
        onOpenChange={close}
        onConfirm={(s: EditScope) => setResult(`scope ${s}`)}
      />
    </Section>
  );
}
