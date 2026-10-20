"use client";

import { Calendar, Library, Music, Plus, Search } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { INSTRUMENTS, InstrumentIcon } from "@/components/app/instruments";
import { RSVP_STATUSES, RsvpIcon, rsvpLabel } from "@/components/app/rsvp";
import { SegmentedToggle } from "@/components/app/segmented-toggle";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Demo, Section } from "@/components/showcase/section";
import { LayoutGrid, List, Rows3 } from "lucide-react";

const SWATCHES: { name: string; cls: string; fg?: string }[] = [
  { name: "background", cls: "bg-background border" },
  { name: "card", cls: "bg-card border" },
  { name: "muted", cls: "bg-muted" },
  { name: "primary", cls: "bg-primary" },
  { name: "gig", cls: "bg-gig" },
  { name: "gig-soft", cls: "bg-gig-soft" },
  { name: "practice", cls: "bg-practice" },
  { name: "practice-soft", cls: "bg-practice-soft" },
  { name: "going", cls: "bg-going" },
  { name: "maybe", cls: "bg-maybe" },
  { name: "declined", cls: "bg-declined" },
  { name: "today", cls: "bg-today" },
  { name: "destructive", cls: "bg-destructive" },
];

export function TokensSection() {
  return (
    <Section
      id="tokens"
      title="Tokens"
      description="Colors, radius, and shadows are CSS variables in globals.css. Toggle the theme at the top to check both."
    >
      <Demo title="Color tokens">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {SWATCHES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1.5">
              <span className={`h-14 rounded-2xl ${s.cls}`} />
              <span className="truncate text-xs text-muted-foreground">
                {s.name}
              </span>
            </li>
          ))}
        </ul>
      </Demo>
      <Demo title="Radius and shadow">
        <div className="flex flex-wrap gap-4">
          <div className="flex h-20 w-28 items-center justify-center rounded-xl border bg-card text-xs shadow-soft">
            xl + soft
          </div>
          <div className="flex h-20 w-28 items-center justify-center rounded-2xl border bg-card text-xs shadow-soft">
            2xl + soft
          </div>
          <div className="flex h-20 w-28 items-center justify-center rounded-3xl border bg-card text-xs shadow-lift">
            3xl + lift
          </div>
        </div>
      </Demo>
    </Section>
  );
}

export function ControlsSection() {
  const [view, setView] = useState("month");
  const [density, setDensity] = useState("large");
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(true);
  return (
    <Section
      id="controls"
      title="Form controls"
      description="All tap targets are at least 44px tall."
    >
      <Demo title="Buttons" className="flex flex-wrap items-center gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="danger">Danger</Button>
        <Button disabled>Disabled</Button>
        <Button size="lg">
          <Plus /> Large
        </Button>
        <Button size="icon" variant="secondary" aria-label="Search">
          <Search />
        </Button>
      </Demo>
      <Demo title="Fields" className="grid gap-4 sm:grid-cols-2">
        <FormField label="Title" htmlFor="sc-title">
          <Input id="sc-title" placeholder="Fall Fest main stage" />
        </FormField>
        <FormField label="Invalid" htmlFor="sc-bad" hint="Title is required">
          <Input
            id="sc-bad"
            aria-invalid
            defaultValue=""
            placeholder="Required"
          />
        </FormField>
        <FormField label="Disabled" htmlFor="sc-dis">
          <Input id="sc-dis" disabled defaultValue="Locked" />
        </FormField>
        <FormField label="Recurrence" htmlFor="sc-select">
          <Select defaultValue="weekly">
            <SelectTrigger id="sc-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Does not repeat</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="biweekly">Every 2 weeks</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Notes" htmlFor="sc-notes" className="sm:col-span-2">
          <Textarea id="sc-notes" placeholder="Load-in at 6, soundcheck at 7" />
        </FormField>
      </Demo>
      <Demo
        title="Switch, checkbox, segmented toggles"
        className="flex flex-col gap-5"
      >
        <div className="flex items-center gap-6">
          <Label className="flex min-h-11 items-center gap-3">
            <Switch checked={on} onCheckedChange={setOn} />
            Notify the band {on ? "(on)" : "(off)"}
          </Label>
          <Label className="flex min-h-11 items-center gap-3">
            <Checkbox
              checked={checked}
              onCheckedChange={(c) => setChecked(c === true)}
            />
            Checkbox
          </Label>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <SegmentedToggle
            label="Calendar view"
            value={view}
            onValueChange={setView}
            options={[
              { value: "month", label: "Month" },
              { value: "week", label: "Week" },
            ]}
          />
          <SegmentedToggle
            label="Media density"
            value={density}
            onValueChange={setDensity}
            options={[
              {
                value: "large",
                label: "Large",
                icon: <LayoutGrid />,
                iconOnly: true,
              },
              {
                value: "compact",
                label: "Compact",
                icon: <Rows3 />,
                iconOnly: true,
              },
              {
                value: "names",
                label: "Names only",
                icon: <List />,
                iconOnly: true,
              },
            ]}
          />
          <span
            className="text-sm text-muted-foreground"
            data-testid="seg-value"
          >
            {view} / {density}
          </span>
        </div>
      </Demo>
    </Section>
  );
}

export function IconsSection() {
  return (
    <Section
      id="icons"
      title="Icons"
      description="Instrument presets come from one module (components/app/instruments.tsx); custom instruments fall back to a generic note. RSVP icons follow the Google Calendar convention."
    >
      <Demo title="Instrument presets">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {INSTRUMENTS.map((i) => (
            <li
              key={i.key}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-soft"
            >
              <InstrumentIcon instrument={i.key} className="size-6" />
              <span className="text-sm font-medium">{i.label}</span>
            </li>
          ))}
          <li className="flex items-center gap-3 rounded-2xl border border-dashed bg-card p-3">
            <InstrumentIcon instrument="Nyckelharpa" className="size-6" />
            <span className="text-sm font-medium">Custom fallback</span>
          </li>
        </ul>
      </Demo>
      <Demo title="RSVP status" className="flex flex-wrap gap-4">
        {RSVP_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-2 text-sm">
            <RsvpIcon status={s} />
            {rsvpLabel(s)}
          </span>
        ))}
      </Demo>
    </Section>
  );
}

export function EmptyStatesSection() {
  return (
    <Section id="empty" title="Empty states">
      <Demo
        title="With action"
        className="rounded-3xl border bg-card shadow-soft"
      >
        <EmptyState
          icon={Music}
          title="No music yet"
          description="Press + to add your first song, or import a playlist."
          action={
            <Button>
              <Plus /> Add song
            </Button>
          }
        />
      </Demo>
      <Demo
        title="Text only"
        className="rounded-3xl border bg-card shadow-soft"
      >
        <EmptyState
          icon={Calendar}
          title="Nothing scheduled"
          description="Gigs and practices will show up here."
        />
      </Demo>
      <Demo
        title="Title only"
        className="rounded-3xl border bg-card shadow-soft"
      >
        <EmptyState icon={Library} title="No setlists" />
      </Demo>
    </Section>
  );
}
