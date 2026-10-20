"use client";

import { Fragment, useState } from "react";
import { AttendeeList } from "@/components/app/rsvp";
import { InstrumentPicker } from "@/components/app/instrument-picker";
import { LinkList, type LinkRow } from "@/components/app/link-list";
import { ListCard } from "@/components/app/list-card";
import { AgendaCard, EventChip, TodayLine } from "@/components/app/event-views";
import { Demo, Section } from "@/components/showcase/section";
import {
  AGENDA,
  ATTENDEES,
  MONTH_CHIPS,
  PLAYLIST_ART,
  SONGS,
} from "@/components/showcase/sample-data";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function CardsSection() {
  const [checked, setChecked] = useState<Record<string, boolean>>({ s2: true });
  return (
    <Section
      id="cards"
      title="Horizontal cards"
      description="Spotify-playlist style rows. They hold up with only a title, with long text, with a drag handle, and with a check state."
    >
      <Demo
        title="Full, title only, long text"
        className="flex max-w-xl flex-col gap-2.5"
      >
        <ListCard
          title="Midnight City"
          subtitle="M83"
          meta="4:03"
          thumbnail={PLAYLIST_ART}
          onClick={() => {}}
        />
        <ListCard title="Untitled jam in D" onClick={() => {}} />
        <ListCard
          title="Dreams"
          subtitle="Fleetwood Mac"
          meta="4:14"
          onClick={() => {}}
        />
        <ListCard
          title={SONGS[3].title}
          subtitle={SONGS[3].artist}
          meta={SONGS[3].duration}
          onClick={() => {}}
        />
      </Demo>
      <Demo
        title="Drag handle and check state"
        note="Tap a card to toggle its check mark."
        className="flex max-w-xl flex-col gap-2.5"
      >
        {SONGS.slice(0, 3).map((s) => (
          <ListCard
            key={s.id}
            title={s.title}
            subtitle={s.artist}
            meta={s.duration}
            draggable
            checked={!!checked[s.id]}
            onClick={() => setChecked((c) => ({ ...c, [s.id]: !c[s.id] }))}
          />
        ))}
      </Demo>
      <Demo title="Selected" className="flex max-w-xl flex-col gap-2.5">
        <ListCard
          title="Superstition"
          subtitle="Stevie Wonder"
          meta="4:26"
          selected
          onClick={() => {}}
        />
      </Demo>
    </Section>
  );
}

export function EventsSection() {
  const [past, setPast] = useState(true);
  const upcoming = AGENDA.filter((e) => !e.past);
  const earlier = AGENDA.filter((e) => e.past);
  return (
    <Section
      id="events"
      title="Event chips and agenda"
      description="Gig is the brand green family, practice is indigo. The today line splits past from upcoming."
    >
      <Demo
        title="Month view chips"
        note="Color by type, time as text, truncating long titles."
      >
        <div className="grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-2xl border bg-border">
          {[18, 19, 20].map((day, i) => (
            <div
              key={day}
              className="flex min-h-24 flex-col gap-1 bg-card p-1.5"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {day}
              </span>
              {i === 0 ? <EventChip {...MONTH_CHIPS[0]} /> : null}
              {i === 1 ? (
                <>
                  <EventChip {...MONTH_CHIPS[1]} />
                  <EventChip {...MONTH_CHIPS[0]} />
                </>
              ) : null}
              {i === 2 ? <EventChip {...MONTH_CHIPS[2]} /> : null}
            </div>
          ))}
        </div>
      </Demo>
      <Demo title="Agenda" className="flex max-w-xl flex-col gap-2.5">
        <Label className="mb-1 flex min-h-11 items-center gap-3 text-sm">
          <Switch checked={past} onCheckedChange={setPast} /> Show past events
        </Label>
        {past
          ? earlier.map((e) => (
              <AgendaCard key={e.id} {...e} timeZone="UTC" onClick={() => {}} />
            ))
          : null}
        <TodayLine />
        {upcoming.map((e) => (
          <Fragment key={e.id}>
            <AgendaCard {...e} timeZone="UTC" onClick={() => {}} />
          </Fragment>
        ))}
      </Demo>
    </Section>
  );
}

export function PeopleSection() {
  const [instruments, setInstruments] = useState<string[]>(["guitar", "Oud"]);
  return (
    <Section
      id="people"
      title="RSVP list and instrument picker"
      description="The attendee list sorts going, maybe, no response, then not going."
    >
      <Demo
        title="Attendees"
        className="max-w-xl rounded-3xl border bg-card p-4 shadow-soft"
      >
        <AttendeeList attendees={ATTENDEES} />
      </Demo>
      <Demo
        title="Empty attendees"
        className="max-w-xl rounded-3xl border bg-card p-4 shadow-soft"
      >
        <AttendeeList attendees={[]} />
      </Demo>
      <Demo
        title="Instrument picker"
        note={`Selected: ${instruments.join(", ") || "none"}`}
        className="max-w-xl"
      >
        <InstrumentPicker value={instruments} onChange={setInstruments} />
      </Demo>
    </Section>
  );
}

export function LinksSection() {
  const [rows, setRows] = useState<LinkRow[]>(SONGS[0].links);
  const [editing, setEditing] = useState(false);
  return (
    <Section
      id="links"
      title="Key-value links"
      description="Label and value rows. Links show the site favicon in read mode; edit mode adds inputs and an add-row button."
    >
      <Demo title="Link list" className="flex max-w-xl flex-col gap-3">
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? "Done" : "Edit links"}
        </Button>
        <LinkList rows={rows} onChange={setRows} editing={editing} />
      </Demo>
      <Demo title="Empty" className="flex max-w-xl flex-col gap-3">
        <LinkList rows={[]} />
      </Demo>
    </Section>
  );
}
