"use client";

import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/app/confirm-dialogs";
import { CalendarSetupDialog } from "@/components/google/calendar-setup-dialog";
import { DriveFolderPicker } from "@/components/google/drive-folder-picker";
import { GigsRootDialog } from "@/components/google/gigs-root-step";
import { Button } from "@/components/ui/button";
import { useFolderListing } from "@/lib/queries/drive-browse";
import {
  connectGoogle,
  useCalendarSync,
  useDisconnectGoogle,
  useDriveStatus,
  useGoogleIntegrations,
} from "@/lib/queries/google";

const RETURN_TO = "/settings";

function agoLabel(iso: string | null): string {
  if (!iso) return "Not synced yet";
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return "Last synced just now";
  if (mins < 60) return `Last synced ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Last synced ${hours} hr ago`;
  return `Last synced ${Math.round(hours / 24)} days ago`;
}

function Row({
  testId,
  title,
  status,
  description,
  detail,
  children,
}: {
  testId: string;
  title: string;
  status: string;
  description?: string;
  detail?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
      <span
        data-testid={`${testId}-status`}
        className="min-w-0 break-words text-sm text-muted-foreground"
      >
        {status}
      </span>
      {detail ? (
        <span
          data-testid={`${testId}-detail`}
          className="text-sm text-muted-foreground"
        >
          {detail}
        </span>
      ) : null}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function GigsFolderLine({
  bandId,
  gigsFolderId,
}: {
  bandId: string;
  gigsFolderId: string;
}) {
  const listing = useFolderListing(bandId, gigsFolderId);
  const [changing, setChanging] = useState(false);
  return (
    <div
      data-testid="settings-google-gigs-folder"
      className="flex w-full flex-wrap items-center gap-2"
    >
      <span className="min-w-0 break-words text-sm text-muted-foreground">
        Gigs folder: {listing.data ? listing.data.folder.name : "..."}
      </span>
      <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>
        Change
      </Button>
      <GigsRootDialog
        bandId={bandId}
        currentId={gigsFolderId}
        open={changing}
        onOpenChange={setChanging}
      />
    </div>
  );
}

function DriveRow({ bandId }: { bandId: string }) {
  const integrations = useGoogleIntegrations(bandId);
  const drive = integrations.data?.drive;
  const status = useDriveStatus(bandId, drive?.linked === true);
  const disconnect = useDisconnectGoogle(bandId, "drive");
  const [picking, setPicking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const folderSet = !!drive?.folderId;

  return (
    <Row
      testId="settings-google-drive"
      title="Google Drive"
      status={
        !drive
          ? "Loading..."
          : drive.linked
            ? `Linked as ${drive.email ?? "a Google account"}`
            : "Not linked"
      }
      detail={
        drive?.linked
          ? folderSet
            ? status.data?.folderName
              ? `Folder: ${status.data.folderName}`
              : "Folder set"
            : "No folder chosen yet"
          : null
      }
    >
      {drive && !drive.linked ? (
        <Button
          variant="outline"
          onClick={() => connectGoogle(bandId, "drive", RETURN_TO)}
        >
          Connect Google Drive
        </Button>
      ) : null}
      {drive?.linked ? (
        <>
          <Button variant="outline" onClick={() => setPicking(true)}>
            {folderSet ? "Change folder" : "Choose folder"}
          </Button>
          {folderSet && status.data?.gigsFolderId ? (
            <GigsFolderLine
              bandId={bandId}
              gigsFolderId={status.data.gigsFolderId}
            />
          ) : null}
          {folderSet && status.data?.folderUrl ? (
            <Button variant="outline" asChild>
              <a href={status.data.folderUrl} target="_blank" rel="noreferrer">
                Open in Drive
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            disabled={disconnect.isPending}
            onClick={() => setConfirming(true)}
          >
            Disconnect
          </Button>
        </>
      ) : null}
      <DriveFolderPicker
        bandId={bandId}
        open={picking}
        onOpenChange={setPicking}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Disconnect Google Drive?"
        description="Existing files stay in Drive, but the app stops showing gig media until you link a folder again."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => disconnect.mutate()}
      />
    </Row>
  );
}

function CalendarRow({ bandId }: { bandId: string }) {
  const integrations = useGoogleIntegrations(bandId);
  const cal = integrations.data?.calendar;
  const ready = !!cal?.calendarId;
  const sync = useCalendarSync(bandId, ready);
  const disconnect = useDisconnectGoogle(bandId, "calendar");
  const [setup, setSetup] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <Row
      testId="settings-google-calendar"
      title="Google Calendar sync (optional)"
      description="Keeps a Greenroom-owned Google calendar in sync within moments of every change. Members are added as readers and accept the share once. RSVPs stay in the app."
      status={
        !cal
          ? "Loading..."
          : ready
            ? "Syncing with Google Calendar"
            : "Not synced"
      }
      detail={ready && sync.data ? agoLabel(sync.data.lastSyncedAt) : null}
    >
      {cal && !ready ? (
        <Button variant="outline" onClick={() => setSetup(true)}>
          Set up Google Calendar sync
        </Button>
      ) : null}
      {ready ? (
        <Button
          variant="outline"
          disabled={disconnect.isPending}
          onClick={() => setConfirming(true)}
        >
          Disconnect
        </Button>
      ) : null}
      <CalendarSetupDialog
        bandId={bandId}
        open={setup}
        onOpenChange={setSetup}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Turn off Google Calendar sync?"
        description="Gigs and practices stop syncing. The Google calendar stays shared with members as it is."
        confirmLabel="Disconnect"
        destructive
        onConfirm={() => disconnect.mutate()}
      />
    </Row>
  );
}

/** Admin Google area of Band settings: Drive and Google Calendar sync rows. */
export function GoogleSettings({ bandId }: { bandId: string }) {
  return (
    <div
      data-testid="settings-google"
      className="flex flex-col gap-5 border-t pt-5"
    >
      <h3 className="text-sm font-semibold">Google</h3>
      <DriveRow bandId={bandId} />
      <CalendarRow bandId={bandId} />
    </div>
  );
}
