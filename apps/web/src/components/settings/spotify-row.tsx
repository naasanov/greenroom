"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { Button } from "@/components/ui/button";
import {
  connectSpotify,
  pathWithout,
  useDisconnectSpotify,
  useSpotifyStatus,
} from "@/lib/queries/spotify";

/** Spotify connection status with connect and disconnect actions. */
export function SpotifyRow() {
  const status = useSpotifyStatus();
  const disconnect = useDisconnectSpotify();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const param = params.get("spotify");
  const [message, setMessage] = useState<"connected" | "error" | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Shows the result of a Spotify login once, then clears it from the URL.
  const returned = param === "connected" || param === "error" ? param : null;
  const [handled, setHandled] = useState<string | null>(null);
  if (returned !== handled && (returned || handled)) {
    setHandled(returned);
    if (returned) setMessage(returned);
  }
  useEffect(() => {
    if (returned) router.replace(pathWithout(pathname, params, ["spotify"]));
  }, [returned, pathname, params, router]);

  const connected = status.data?.connected === true;

  return (
    <div className="flex flex-col gap-2" data-testid="settings-spotify">
      <p className="text-sm font-medium">Spotify</p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span
          data-testid="settings-spotify-status"
          className="min-w-0 truncate text-sm text-muted-foreground"
        >
          {status.isPending
            ? "Loading..."
            : connected
              ? `Connected as ${status.data?.displayName ?? "Spotify user"}`
              : "Not connected"}
        </span>
        {status.data ? (
          connected ? (
            <Button
              variant="outline"
              disabled={disconnect.isPending}
              onClick={() => setConfirming(true)}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => connectSpotify("/settings")}
            >
              Connect Spotify
            </Button>
          )
        ) : null}
      </div>
      {message === "connected" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Spotify connected.
        </p>
      ) : message === "error" ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t connect Spotify. Try again.
        </p>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Disconnect Spotify?"
        description="You will need to connect again the next time you import a playlist."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => {
          setMessage(null);
          disconnect.mutate();
        }}
      />
    </div>
  );
}
