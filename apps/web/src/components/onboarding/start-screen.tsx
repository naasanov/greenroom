"use client";

import { Link2 } from "lucide-react";
import { AuthLayout, Brand } from "@/components/onboarding/auth-layout";
import { CreateBandForm } from "@/components/onboarding/create-band-form";
import type { BandSummary } from "@greenroom/shared";

/** Shown to signed-in users with no bands: create one, or wait for an invite link. */
export function StartScreen({
  name,
  onCreated,
  onSignOut,
}: {
  name: string;
  onCreated: (band: BandSummary) => void;
  onSignOut: () => void;
}) {
  const first = name.trim().split(/\s+/)[0] || "there";
  return (
    <AuthLayout>
      <Brand className="justify-center" />
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hi {first}, let&apos;s get you on stage
        </h1>
        <p className="text-sm text-muted-foreground">
          You are not in a band yet.
        </p>
      </div>

      <section
        aria-labelledby="create-band-heading"
        className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-soft"
      >
        <div className="flex flex-col gap-1">
          <h2 id="create-band-heading" className="text-lg font-semibold">
            Create a band
          </h2>
          <p className="text-sm text-muted-foreground">
            Start a home for your gigs, practices, and setlists, then invite
            your bandmates.
          </p>
        </div>
        <CreateBandForm onCreated={onCreated} />
      </section>

      <section
        aria-labelledby="join-band-heading"
        className="flex items-start gap-3 rounded-3xl border border-dashed bg-muted/40 p-5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-gig-soft text-gig-soft-foreground">
          <Link2 className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id="join-band-heading" className="font-semibold">
            Joining a band?
          </h2>
          <p className="text-sm text-muted-foreground">
            Open the invite link your bandmate sent you.
          </p>
        </div>
      </section>

      <button
        type="button"
        onClick={onSignOut}
        className="self-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Sign out
      </button>
    </AuthLayout>
  );
}
