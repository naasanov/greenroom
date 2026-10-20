"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CurrentBandProvider } from "@/lib/current-band";
import { useBands, useMe } from "@/lib/queries";
import { signInUrl } from "@/lib/redirect";

/** Validates the session via /auth/me and provides the user's bands and current band. */
export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const bands = useBands(!!me.data);
  const signedOut = me.isSuccess && !me.data;

  useEffect(() => {
    if (!signedOut) return;
    const here = pathname + window.location.search;
    router.replace(signInUrl(here));
  }, [signedOut, pathname, router]);

  if (!me.data || !bands.data) {
    return (
      <main className="flex flex-1 items-center justify-center">
        {me.isError || bands.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Something went wrong. Please reload.
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
