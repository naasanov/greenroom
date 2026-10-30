"use client";

import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BandAvatar } from "@/components/app/band-switcher";
import { AuthLayout, Brand } from "@/components/onboarding/auth-layout";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import {
  useAcceptInvite,
  useInvitePlaceholders,
  useInvitePreview,
  useLinkPlaceholder,
  useMe,
} from "@/lib/queries";
import { InstrumentIcon, instrumentLabel } from "@/components/app/instruments";
import { signInUrl } from "@/lib/redirect";

/** Public invite landing: preview the band, then sign in or join. */
export function InviteView() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const preview = useInvitePreview(token);
  const me = useMe();
  const accept = useAcceptInvite(token);
  const link = useLinkPlaceholder(token);
  const placeholders = useInvitePlaceholders(token, !!me.data);

  if (preview.isError) {
    const gone = isApiError(preview.error, 404);
    return (
      <AuthLayout>
        <Brand className="justify-center" />
        <div className="flex flex-col items-center gap-4 rounded-3xl border bg-card p-6 text-center shadow-soft">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold">
              {gone
                ? "This invite link is no longer valid"
                : "Something went wrong"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {gone
                ? "It may have been reset by a band admin. Ask your bandmate for a fresh link."
                : "We could not load this invite. Please try again."}
            </p>
          </div>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/">Go to Greenroom</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (!preview.data || me.isLoading || (me.data && placeholders.isLoading)) {
    return (
      <AuthLayout>
        <Loader2
          aria-label="Loading"
          className="mx-auto size-6 animate-spin text-muted-foreground"
        />
      </AuthLayout>
    );
  }

  const { band, memberCount } = preview.data;
  const here = `/invite/${token}`;
  const claimable = placeholders.data ?? [];
  const busy = accept.isPending || link.isPending;
  const failure = accept.isError ? accept.error : link.error;
  const go = { onSuccess: () => router.replace("/") };

  return (
    <AuthLayout>
      <Brand className="justify-center" />
      <div className="flex flex-col items-center gap-5 rounded-3xl border bg-card p-6 text-center shadow-soft">
        <p className="text-sm text-muted-foreground">You are invited to join</p>
        <BandAvatar
          band={{ id: token, name: band.name, imageUrl: band.photoUrl }}
          className="size-24 rounded-3xl text-2xl after:hidden"
        />
        <div className="flex flex-col items-center gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {band.name}
          </h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="size-4" />
            {memberCount} {memberCount === 1 ? "member" : "members"}
          </p>
        </div>
        {me.data && claimable.length > 0 ? (
          <div className="flex w-full flex-col gap-3 text-left">
            <h2 className="text-center text-base font-semibold">
              Is one of these you?
            </h2>
            <ul className="flex flex-col gap-2" aria-label="Roster entries">
              {claimable.map((p) => {
                const ins = [...p.instruments.presets, ...p.instruments.custom];
                return (
                  <li
                    key={p.userId}
                    data-testid="claim-entry"
                    className="flex items-center gap-3 rounded-2xl border bg-background p-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {p.displayName}
                      </span>
                      {ins.length > 0 ? (
                        <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                          {ins.slice(0, 3).map((i) => (
                            <InstrumentIcon
                              key={i}
                              instrument={i}
                              className="size-3.5"
                            />
                          ))}
                          {ins.map(instrumentLabel).join(", ")}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy}
                      aria-label={`That's me: ${p.displayName}`}
                      onClick={() => link.mutate(p.userId, go)}
                    >
                      That&apos;s me
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button
              size="lg"
              variant="ghost"
              disabled={busy}
              onClick={() => accept.mutate(undefined, go)}
            >
              None of these
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Signed in as {me.data.email}
            </p>
            {failure ? (
              <p role="alert" className="text-sm text-destructive">
                {isApiError(failure, 409)
                  ? "That entry was already claimed. Reload to see the latest list."
                  : isApiError(failure, 404)
                    ? "This invite link is no longer valid."
                    : "We could not add you to the band. Please try again."}
              </p>
            ) : null}
          </div>
        ) : me.data ? (
          <div className="flex w-full flex-col gap-2">
            <Button
              size="lg"
              disabled={accept.isPending}
              onClick={() => accept.mutate(undefined, go)}
            >
              {accept.isPending ? "Joining..." : `Join ${band.name}`}
            </Button>
            <p className="text-xs text-muted-foreground">
              Signed in as {me.data.email}
            </p>
            {accept.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {isApiError(accept.error, 404)
                  ? "This invite link is no longer valid."
                  : "We could not add you to the band. Please try again."}
              </p>
            ) : null}
          </div>
        ) : (
          <Button asChild size="lg" className="w-full">
            <Link href={signInUrl(here)}>Sign in to join</Link>
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
