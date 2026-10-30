"use client";

import {
  Calendar,
  ListMusic,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BandSwitcher, type BandSummary } from "@/components/app/band-switcher";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Placement, ShellLayout } from "@/components/app/event-types";
import { cn } from "@/lib/utils";

export type TabKey = "events" | "library" | "roster";

/** When set, tabs render as links to this href instead of buttons. */
export type TabHref = (tab: TabKey) => string;

export const NAV_TABS: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: "events", label: "Events", icon: Calendar },
  { key: "library", label: "Music Library", icon: ListMusic },
  { key: "roster", label: "Roster", icon: Users },
];

const SHOW_BOTTOM: Record<ShellLayout, string> = {
  responsive: "md:hidden",
  mobile: "",
  desktop: "hidden",
};
const SHOW_TOP_TABS: Record<ShellLayout, string> = {
  responsive: "hidden md:flex",
  mobile: "hidden",
  desktop: "flex",
};

/** A tab control: a link when it has an href, otherwise a button. */
function TabItem({
  href,
  children,
  ...props
}: {
  href?: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  "aria-current"?: "page";
}) {
  if (href) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" {...props}>
      {children}
    </button>
  );
}

/** Mobile bottom tab bar (tap only). Hidden on desktop in responsive layout. */
export function BottomTabBar({
  active,
  onChange,
  tabHref,
  layout = "responsive",
  placement = "fixed",
  className,
}: {
  active: TabKey | null;
  onChange?: (tab: TabKey) => void;
  tabHref?: TabHref;
  layout?: ShellLayout;
  placement?: Placement;
  className?: string;
}) {
  return (
    <nav
      aria-label="Primary"
      data-testid="bottom-tab-bar"
      className={cn(
        placement === "fixed" ? "fixed" : "absolute",
        "inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-safe backdrop-blur-lg",
        SHOW_BOTTOM[layout],
        className,
      )}
    >
      <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-lg grid-cols-3">
        {NAV_TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <li key={t.key} className="flex">
              <TabItem
                href={tabHref?.(t.key)}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onChange?.(t.key)}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium outline-none transition-colors focus-visible:bg-muted",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                    isActive && "bg-gig-soft",
                  )}
                >
                  <t.icon
                    className="size-[1.375rem]"
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                </span>
                {t.label}
              </TabItem>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop top tabs. Hidden on mobile in responsive layout. */
export function TopTabs({
  active,
  onChange,
  tabHref,
  layout = "responsive",
  className,
}: {
  active: TabKey | null;
  onChange?: (tab: TabKey) => void;
  tabHref?: TabHref;
  layout?: ShellLayout;
  className?: string;
}) {
  return (
    <nav
      aria-label="Primary"
      data-testid="top-tabs"
      className={cn("items-center gap-1", SHOW_TOP_TABS[layout], className)}
    >
      {NAV_TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <TabItem
            key={t.key}
            href={tabHref?.(t.key)}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onChange?.(t.key)}
            className={cn(
              "flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              isActive
                ? "bg-gig-soft text-gig-soft-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <t.icon className="size-[1.125rem]" />
            {t.label}
          </TabItem>
        );
      })}
    </nav>
  );
}

export function ProfileButton({
  name,
  imageUrl,
  onClick,
}: {
  name?: string;
  imageUrl?: string | null;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Profile and settings"
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Avatar className="size-9">
        {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
        <AvatarFallback className="bg-secondary text-secondary-foreground">
          {name ? (
            name.slice(0, 1).toUpperCase()
          ) : (
            <UserRound className="size-5" />
          )}
        </AvatarFallback>
      </Avatar>
    </button>
  );
}

/**
 * Top bar (band switcher, desktop tabs, profile) + content + mobile tab bar.
 * Presentational: the active tab comes from props; pass tabHref to make tabs links.
 */
export function AppShell({
  bands,
  activeBandId,
  onBandChange,
  onCreateBand,
  onBandSettings,
  activeTab,
  onTabChange,
  tabHref,
  profile,
  onProfileClick,
  layout = "responsive",
  placement = "fixed",
  children,
  className,
}: {
  bands: BandSummary[];
  activeBandId: string;
  onBandChange?: (id: string) => void;
  onCreateBand?: () => void;
  onBandSettings?: () => void;
  /** Null on pages outside the tabs (e.g. settings). */
  activeTab: TabKey | null;
  onTabChange?: (tab: TabKey) => void;
  tabHref?: TabHref;
  profile?: { name?: string; imageUrl?: string | null };
  onProfileClick?: () => void;
  layout?: ShellLayout;
  placement?: Placement;
  children?: ReactNode;
  className?: string;
}) {
  const contained = placement === "contained";
  return (
    <div
      className={cn(
        "relative flex flex-col bg-background",
        contained ? "h-full min-h-0" : "min-h-dvh",
        className,
      )}
    >
      <header
        data-testid="top-bar"
        className={cn(
          "pt-safe z-20 border-b bg-background/90 backdrop-blur-lg",
          contained ? "shrink-0" : "sticky top-0",
        )}
      >
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-3">
          <BandSwitcher
            bands={bands}
            activeId={activeBandId}
            onSelect={onBandChange}
            onCreate={onCreateBand}
            onSettings={onBandSettings}
            className="max-w-[60%] md:max-w-64"
          />
          <TopTabs
            active={activeTab}
            onChange={onTabChange}
            tabHref={tabHref}
            layout={layout}
            className="ml-3"
          />
          <div className="flex-1" />
          <FeedbackWidget bandId={activeBandId} />
          <ProfileButton {...profile} onClick={onProfileClick} />
        </div>
      </header>
      <main
        className={cn(
          "flex-1",
          contained && "min-h-0 overflow-y-auto",
          // Room for the tab bar so content never hides behind it.
          layout !== "desktop" &&
            "pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))]",
          layout === "responsive" && "md:pb-0",
        )}
      >
        {children}
      </main>
      <BottomTabBar
        active={activeTab}
        onChange={onTabChange}
        tabHref={tabHref}
        layout={layout}
        placement={placement}
      />
    </div>
  );
}
