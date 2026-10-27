"use client";

import { Folder, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isApiError } from "@/lib/api";
import {
  fetchPickerConfig,
  useFakePicker,
  useSetDriveFolder,
} from "@/lib/queries/google";

// Minimal typings for the parts of the Google Picker this app uses.
interface PickerDoc {
  id: string;
}
interface PickerResponse {
  action: string;
  docs?: PickerDoc[];
}
interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(cb: (r: PickerResponse) => void): PickerBuilder;
  build(): { setVisible(v: boolean): void };
}
interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId: unknown) => {
    setSelectFolderEnabled(v: boolean): unknown;
    setIncludeFolders(v: boolean): unknown;
    setMimeTypes(types: string): unknown;
  };
  ViewId: { FOLDERS: unknown };
  Action: { PICKED: string; CANCEL: string };
}
declare global {
  interface Window {
    gapi?: { load(name: string, cb: () => void): void };
    google?: { picker?: PickerNamespace };
  }
}

const GAPI_SRC = "https://apis.google.com/js/api.js";

function loadPickerLib(): Promise<PickerNamespace> {
  return new Promise((resolve, reject) => {
    const ready = () =>
      window.gapi!.load("picker", () => {
        const ns = window.google?.picker;
        if (ns) resolve(ns);
        else reject(new Error("Picker unavailable"));
      });
    if (window.gapi) return ready();
    const script = document.createElement("script");
    script.src = GAPI_SRC;
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error("Could not load Google"));
    document.head.appendChild(script);
  });
}

const errorText = (e: unknown) =>
  isApiError(e) && e.code === "DRIVE_NOT_A_FOLDER"
    ? "That is not a folder. Pick a folder."
    : "We could not use that folder. Please try again.";

/**
 * Lets the user choose the band's Drive folder: the real Google Picker, or a
 * stand-in dialog when the API reports fake integrations.
 */
export function DriveFolderPicker({
  bandId,
  open,
  onOpenChange,
}: {
  bandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const setFolder = useSetDriveFolder(bandId);
  const [mode, setMode] = useState<"loading" | "fake" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const { mutate } = setFolder;
  const closeRef = useRef(onOpenChange);
  useEffect(() => {
    closeRef.current = onOpenChange;
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode("loading");
    setError(null);
    fetchPickerConfig(bandId)
      .then(async (config) => {
        if (cancelled) return;
        if (config.fake) return setMode("fake");
        const picker = await loadPickerLib();
        if (cancelled) return;
        const view = new picker.DocsView(picker.ViewId.FOLDERS);
        view.setSelectFolderEnabled(true);
        view.setIncludeFolders(true);
        view.setMimeTypes("application/vnd.google-apps.folder");
        const builder = new picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(config.accessToken)
          .setTitle("Choose your band's folder")
          .setCallback((r) => {
            if (r.action === picker.Action.PICKED && r.docs?.[0]) {
              mutate(r.docs[0].id, {
                onSuccess: () => closeRef.current(false),
                onError: (e) => {
                  setError(errorText(e));
                  setMode("error");
                },
              });
            } else if (r.action === picker.Action.CANCEL) {
              closeRef.current(false);
            }
          });
        if (config.developerKey) builder.setDeveloperKey(config.developerKey);
        if (config.appId) builder.setAppId(config.appId);
        builder.build().setVisible(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("We could not open Google Drive. Please try again.");
        setMode("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, bandId, mutate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="drive-picker"
        className="z-[60] pointer-events-auto!"
        // Keeps a gig drawer underneath from treating picker clicks as outside clicks.
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Choose your band&apos;s Drive folder
          </DialogTitle>
          <DialogDescription>
            Gig photos and videos are kept in this folder.
          </DialogDescription>
        </DialogHeader>
        {mode === "fake" ? (
          <FakeFolderList
            bandId={bandId}
            pending={setFolder.isPending}
            error={error}
            onPick={(id) => {
              setError(null);
              mutate(id, {
                onSuccess: () => onOpenChange(false),
                onError: (e) => setError(errorText(e)),
              });
            }}
          />
        ) : mode === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" />
            Opening Google Drive...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FakeFolderList({
  bandId,
  pending,
  error,
  onPick,
}: {
  bandId: string;
  pending: boolean;
  error: string | null;
  onPick: (id: string) => void;
}) {
  const folders = useFakePicker(bandId, true);
  return (
    <div className="flex flex-col gap-2">
      {folders.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading folders...
        </p>
      ) : folders.data?.folders.length ? (
        <ul className="flex flex-col gap-2">
          {folders.data.folders.map((f) => (
            <li key={f.id}>
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={pending}
                onClick={() => onPick(f.id)}
              >
                <Folder />
                {f.name}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No folders found.</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
