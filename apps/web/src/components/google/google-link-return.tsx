"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { GoogleLinkErrorReason, GoogleService } from "@greenroom/shared";
import { CalendarSetupDialog } from "@/components/google/calendar-setup-dialog";
import { DriveFolderPicker } from "@/components/google/drive-folder-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { pathWithout } from "@/lib/queries/spotify";

type Flow =
  | { kind: "calendar" }
  | { kind: "drive" }
  | { kind: "error"; service: GoogleService | null; reason: string };

const REASONS: Record<GoogleLinkErrorReason, string> = {
  denied: "Google sign-in was cancelled.",
  scope_denied: "Greenroom needs access to continue. Allow it and try again.",
  invalid_state: "That sign-in expired. Please try again.",
  exchange_failed: "Google did not accept the sign-in. Please try again.",
};

const PARAMS = ["google", "service", "reason"];

/**
 * Handles the return from the Google sign-in: runs calendar setup or opens the
 * Drive folder picker, shows failures, and strips the params from the URL.
 */
export function GoogleLinkReturn({ bandId }: { bandId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const google = params.get("google");
  const service = params.get("service");
  const reason = params.get("reason");
  const svc: GoogleService | null =
    service === "drive" || service === "calendar" ? service : null;
  const returned =
    google === "connected" && svc
      ? `connected:${svc}`
      : google === "error"
        ? `error:${svc ?? ""}:${reason ?? ""}`
        : null;

  const [flow, setFlow] = useState<Flow | null>(null);
  const [handled, setHandled] = useState<string | null>(null);
  if (returned !== handled && (returned || handled)) {
    setHandled(returned);
    if (returned) {
      setFlow(
        google === "connected" && svc
          ? { kind: svc }
          : { kind: "error", service: svc, reason: reason ?? "" },
      );
    }
  }
  useEffect(() => {
    if (returned) router.replace(pathWithout(pathname, params, PARAMS));
  }, [returned, pathname, params, router]);

  const close = () => setFlow(null);
  const label =
    flow?.kind === "error" && flow.service === "calendar"
      ? "Google Calendar"
      : "Google Drive";
  return (
    <>
      <CalendarSetupDialog
        bandId={bandId}
        open={flow?.kind === "calendar"}
        onOpenChange={(o) => !o && close()}
      />
      <DriveFolderPicker
        bandId={bandId}
        open={flow?.kind === "drive"}
        onOpenChange={(o) => !o && close()}
      />
      <Dialog open={flow?.kind === "error"} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Couldn&apos;t connect {label}
            </DialogTitle>
            <DialogDescription role="alert">
              {flow?.kind === "error"
                ? (REASONS[flow.reason as GoogleLinkErrorReason] ??
                  "Something went wrong. Please try again.")
                : null}
            </DialogDescription>
          </DialogHeader>
          <Button onClick={close}>OK</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
