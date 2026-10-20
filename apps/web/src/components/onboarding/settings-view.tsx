"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { BandAvatar } from "@/components/app/band-switcher";
import { tabPath, useLastTab } from "@/components/app/routed-shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCurrentBand } from "@/lib/current-band";
import { useMe, useSignOut } from "@/lib/queries";

/** Settings page: personal account for everyone, band section for admins. */
export function SettingsView() {
  const me = useMe().data;
  const { currentBand } = useCurrentBand();
  const signOut = useSignOut();
  const lastTab = useLastTab();
  if (!me) return null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-5">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Back" asChild>
          <Link href={tabPath(lastTab ?? "events")}>
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </div>

      <section
        aria-labelledby="settings-personal"
        className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-soft"
      >
        <h2
          id="settings-personal"
          className="text-sm font-semibold text-muted-foreground"
        >
          Personal
        </h2>
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {me.avatarUrl ? <AvatarImage src={me.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-secondary text-xl font-semibold text-secondary-foreground">
              {me.displayName.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span
              data-testid="settings-name"
              className="truncate text-lg font-semibold"
            >
              {me.displayName}
            </span>
            <span
              data-testid="settings-email"
              className="truncate text-sm text-muted-foreground"
            >
              {me.email}
            </span>
          </div>
        </div>
        <Button
          variant="outline"
          size="lg"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          Sign out
        </Button>
      </section>

      {currentBand?.role === "admin" ? (
        <section
          aria-labelledby="settings-band"
          data-testid="settings-band"
          className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-soft"
        >
          <h2
            id="settings-band"
            className="text-sm font-semibold text-muted-foreground"
          >
            Band
          </h2>
          <div className="flex items-center gap-4">
            <BandAvatar
              band={{
                id: currentBand.id,
                name: currentBand.name,
                imageUrl: currentBand.photoUrl,
              }}
              className="size-16 text-xl"
            />
            <span
              data-testid="settings-band-name"
              className="truncate text-lg font-semibold"
            >
              {currentBand.name}
            </span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
