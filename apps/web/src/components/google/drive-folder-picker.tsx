"use client";

import { Folder, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isApiError } from "@/lib/api";
import { useBands } from "@/lib/queries";
import {
  fetchPickerConfig,
  useCreateDriveFolder,
  useFakePicker,
  useSetDriveFolder,
} from "@/lib/queries/google";
import type { GooglePickerConfig } from "@greenroom/shared";

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
    setParent(id: string): unknown;
  };
  ViewId: { DOCS: unknown };
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
  const createFolder = useCreateDriveFolder(bandId);
  const bands = useBands();
  const bandName = bands.data?.find((b) => b.id === bandId)?.name ?? "";
  const [mode, setMode] = useState<"loading" | "fake" | "real" | "error">(
    "loading",
  );
  const [config, setConfig] = useState<GooglePickerConfig | null>(null);
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
      .then((c) => {
        if (cancelled) return;
        setConfig(c);
        setMode(c.fake ? "fake" : "real");
      })
      .catch(() => {
        if (cancelled) return;
        setError("We could not open Google Drive. Please try again.");
        setMode("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, bandId]);

  async function openPicker() {
    if (!config) return;
    setError(null);
    try {
      const picker = await loadPickerLib();
      // DOCS rooted at My Drive lets the user click into folders like normal Drive.
      const view = new picker.DocsView(picker.ViewId.DOCS);
      view.setParent("root");
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(true);
      view.setMimeTypes("application/vnd.google-apps.folder");
      const builder = new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(config.accessToken)
        .setTitle("Choose your band's folder")
        .setCallback((r) => {
          if (r.action === picker.Action.PICKED && r.docs?.[0]) {
            mutate(r.docs[0].id, {
              onSuccess: () => closeRef.current(false),
              onError: (e) => setError(errorText(e)),
            });
          }
        });
      if (config.developerKey) builder.setDeveloperKey(config.developerKey);
      if (config.appId) builder.setAppId(config.appId);
      builder.build().setVisible(true);
    } catch {
      setError("We could not open Google Drive. Please try again.");
    }
  }

  function create(name: string) {
    setError(null);
    createFolder.mutate(name, {
      onSuccess: () => onOpenChange(false),
      onError: () => setError("We could not create that folder. Try again."),
    });
  }

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
            pending={setFolder.isPending || createFolder.isPending}
            error={error}
            defaultName={bandName}
            onCreate={create}
            onPick={(id) => {
              setError(null);
              mutate(id, {
                onSuccess: () => onOpenChange(false),
                onError: (e) => setError(errorText(e)),
              });
            }}
          />
        ) : mode === "real" ? (
          <div className="flex flex-col gap-3">
            <Button variant="outline" onClick={() => void openPicker()}>
              <Folder />
              Choose from Google Drive
            </Button>
            <NewFolderForm
              defaultName={bandName}
              pending={setFolder.isPending || createFolder.isPending}
              onCreate={create}
            />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
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

/** Name input and Create button; the folder is made in My Drive root. */
function NewFolderForm({
  defaultName,
  pending,
  onCreate,
}: {
  defaultName: string;
  pending: boolean;
  onCreate: (name: string) => void;
}) {
  const [edited, setEdited] = useState<string | null>(null);
  const name = edited ?? defaultName;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) onCreate(name.trim());
  };
  return (
    <form
      onSubmit={submit}
      data-testid="drive-new-folder"
      className="flex flex-col gap-2"
    >
      <label htmlFor="drive-new-folder-name" className="text-sm font-medium">
        New folder
      </label>
      <div className="flex gap-2">
        <Input
          id="drive-new-folder-name"
          value={name}
          maxLength={200}
          onChange={(e) => setEdited(e.target.value)}
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          Create
        </Button>
      </div>
    </form>
  );
}

function FakeFolderList({
  bandId,
  pending,
  error,
  defaultName,
  onPick,
  onCreate,
}: {
  bandId: string;
  pending: boolean;
  error: string | null;
  defaultName: string;
  onPick: (id: string) => void;
  onCreate: (name: string) => void;
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
      <NewFolderForm
        defaultName={defaultName}
        pending={pending}
        onCreate={onCreate}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
