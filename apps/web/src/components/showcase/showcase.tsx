"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedToggle } from "@/components/app/segmented-toggle";
import {
  CardsSection,
  EventsSection,
  LinksSection,
  PeopleSection,
} from "@/components/showcase/content";
import {
  ControlsSection,
  EmptyStatesSection,
  IconsSection,
  TokensSection,
} from "@/components/showcase/foundations";
import {
  DialogsSection,
  DrawersSection,
  SheetSection,
} from "@/components/showcase/overlays";
import {
  SelectionSection,
  ShellSection,
} from "@/components/showcase/shell-demos";
import { useTheme, type ThemePreference } from "@/lib/theme";

const NAV = [
  ["tokens", "Tokens"],
  ["controls", "Controls"],
  ["icons", "Icons"],
  ["shell", "Shell + FAB"],
  ["cards", "Cards"],
  ["events", "Events"],
  ["drawers", "Drawers"],
  ["sheet", "Sheet"],
  ["selection", "Selection"],
  ["dialogs", "Dialogs"],
  ["people", "People"],
  ["links", "Links"],
  ["empty", "Empty"],
] as const;

export function Showcase() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="min-h-dvh">
      <header className="pt-safe sticky top-0 z-30 border-b bg-background/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 pt-2">
          <h1 className="flex-1 text-lg font-semibold tracking-tight">
            Greenroom{" "}
            <span className="font-normal text-muted-foreground">
              components
            </span>
          </h1>
          <SegmentedToggle<ThemePreference>
            label="Theme"
            value={preference}
            onValueChange={setPreference}
            options={[
              {
                value: "system",
                label: "System",
                icon: <Monitor />,
                iconOnly: true,
              },
              { value: "light", label: "Light", icon: <Sun />, iconOnly: true },
              { value: "dark", label: "Dark", icon: <Moon />, iconOnly: true },
            ]}
          />
        </div>
        <nav aria-label="Jump to section" className="mx-auto max-w-5xl">
          <ul className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5">
            {NAV.map(([id, label]) => (
              <li key={id} className="shrink-0">
                <a
                  href={`#${id}`}
                  className="flex h-9 items-center rounded-full bg-muted px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 pt-8 pb-32">
        <TokensSection />
        <ControlsSection />
        <IconsSection />
        <ShellSection />
        <CardsSection />
        <EventsSection />
        <DrawersSection />
        <SheetSection />
        <SelectionSection />
        <DialogsSection />
        <PeopleSection />
        <LinksSection />
        <EmptyStatesSection />
      </main>
    </div>
  );
}
