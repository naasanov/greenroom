"use client";

import { Loader2, Users } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BandAvatar } from "@/components/app/band-switcher";
import { AuthLayout, Brand } from "@/components/onboarding/auth-layout";
import { Button } from "@/components/ui/button";
import { isApiError } from "@/lib/api";
import { useAcceptInvite, useInvitePreview, useMe } from "@/lib/queries";
import { signInUrl } from "@/lib/redirect";

/** Public invite landing: preview the band, then sign in or join. */
export function InviteView() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const preview = useInvitePreview(token);
  const me = useMe();
  const accept = useAcceptInvite(token);

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

  if (!preview.data || me.isLoading) {
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
        {me.data ? (
          <div className="flex w-full flex-col gap-2">
            <Button
              size="lg"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(undefined, {
                  onSuccess: () => router.replace("/"),
                })
              }
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
