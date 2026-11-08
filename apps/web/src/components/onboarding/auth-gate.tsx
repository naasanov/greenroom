"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CurrentBandProvider } from "@/lib/current-band";
import { useBands, useMe } from "@/lib/queries";
import { signInUrl } from "@/lib/redirect";
import { isWelcomePending } from "@/lib/welcome-pending";

/** Validates the session via /auth/me and provides the user's bands and current band. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const bands = useBands();
  const signedOut = me.isSuccess && !me.data;
  const offline = typeof navigator !== "undefined" && !navigator.onLine;

  useEffect(() => {
    if (!signedOut) return;
    const here = pathname + window.location.search;
    router.replace(signInUrl(here));
  }, [signedOut, pathname, router]);

  // A new user who left /welcome without Continue is sent back until they finish it.
  const signedIn = !!me.data;
  useEffect(() => {
    if (!signedIn || !isWelcomePending()) return;
    const here = pathname + window.location.search;
    router.replace(`/welcome?redirectTo=${encodeURIComponent(here)}`);
  }, [signedIn, pathname, router]);

  if (!me.data || !bands.data) {
    return (
      <main className="flex flex-1 items-center justify-center">
        {me.isError || (me.data && bands.isError) ? (
          <p
            role="alert"
            data-testid={offline ? "offline-state" : undefined}
            className="text-sm text-destructive"
          >
            {offline
              ? "You are offline. Reconnect and reload to open Greenroom. Stage mode for upcoming gigs still works."
              : "Something went wrong. Please reload."}
          </p>
        ) : (
          <Loader2
            aria-label="Loading"
            className="size-6 animate-spin text-muted-foreground"
          />
        )}
      </main>
    );
  }
  return (
    <CurrentBandProvider bands={bands.data}>{children}</CurrentBandProvider>
  );
}
