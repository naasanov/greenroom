"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ImagePlus,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicUploadLinkInfo } from "@greenroom/shared";
import { Brand } from "@/components/onboarding/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import {
  UploadLinkInvalidError,
  fetchPublicLinkInfo,
  publicEndpoints,
} from "@/lib/queries/upload-links";
import { isAbortError, uploadFile } from "@/lib/uploader";
import { cn } from "@/lib/utils";
import { formatBytes, formatGigDate } from "./format";

const CONCURRENCY = 2;

interface Item {
  id: string;
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  sent: number;
  error?: string;
  retryable?: boolean;
}

function messageFor(e: unknown, maxFileBytes: number): string {
  if (e instanceof UploadLinkInvalidError) {
    return e.reason === "revoked"
      ? "This link was turned off."
      : "This link has expired.";
  }
  if (e instanceof ApiError) {
    if (e.code === "UPLOAD_TYPE_NOT_ALLOWED")
      return "Only photos and videos can be uploaded.";
    if (e.code === "UPLOAD_TOO_LARGE")
      return `This file is too large (max ${formatBytes(maxFileBytes)}).`;
    if (e.code === "UPLOAD_LINK_FULL")
      return "This link has reached its size limit.";
    if (e.code === "UPLOAD_LINK_INVALID")
      return "This link is no longer accepting uploads.";
    if (e.status === 429) return "Too many uploads right now. Try again soon.";
  }
  return "Upload failed. Check your connection and retry.";
}

/** Network, server, and rate-limit failures may succeed on a later try. */
function isRetryable(e: unknown): boolean {
  if (e instanceof UploadLinkInvalidError) return false;
  if (e instanceof ApiError) return e.status === 429 || e.status >= 500;
  return true;
}

/** Anonymous upload page for one gig; nothing here reads or links into the app. */
export function PublicUploadView() {
  const { token } = useParams<{ token: string }>();
  const info = useQuery({
    queryKey: ["public-upload-link", token],
    queryFn: () => fetchPublicLinkInfo(token),
    retry: (n, e) => !(e instanceof UploadLinkInvalidError) && n < 2,
    staleTime: Infinity,
  });

  return (
    <main className="flex flex-1 flex-col items-center bg-background px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Brand className="justify-center" />
        {info.isPending ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : info.isError ? (
          <Unavailable error={info.error} />
        ) : (
          <Uploader token={token} info={info.data} />
        )}
      </div>
    </main>
  );
}

function Unavailable({ error }: { error: unknown }) {
  const reason =
    error instanceof UploadLinkInvalidError ? error.reason : "error";
  const copy = {
    expired: [
      "This upload link has expired",
      "Uploads are closed for this gig. Ask your bandmate for a new link.",
    ],
    revoked: [
      "This upload link was turned off",
      "The band closed this link. Ask your bandmate if you still need to share something.",
    ],
    unknown: [
      "We can't find this upload link",
      "Check that you copied the whole link, or ask your bandmate to send it again.",
    ],
    error: [
      "Something went wrong",
      "We could not load this page. Please try again in a moment.",
    ],
  }[reason];
  return (
    <div
      data-testid="upload-link-unavailable"
      data-reason={reason}
      className="flex flex-col items-center gap-3 rounded-3xl border bg-card p-6 text-center shadow-soft"
    >
      <Clock className="size-8 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{copy![0]}</h1>
      <p className="text-sm text-muted-foreground">{copy![1]}</p>
    </div>
  );
}

function Uploader({
  token,
  info,
}: {
  token: string;
  info: PublicUploadLinkInfo;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [name, setName] = useState("");
  const [dragging, setDragging] = useState(false);
  const started = useRef(new Set<string>());

  const endpoints = useMemo(
    () => publicEndpoints(token, () => name),
    [token, name],
  );
  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const run = useCallback(
    async (item: Item) => {
      update(item.id, { status: "uploading", sent: 0, error: undefined });
      try {
        await uploadFile(item.file, endpoints, {
          onProgress: (sent) => update(item.id, { sent }),
        });
        update(item.id, { status: "done", sent: item.file.size });
      } catch (e) {
        if (isAbortError(e)) return;
        update(item.id, {
          status: "error",
          error: messageFor(e, info.maxFileBytes),
          retryable: isRetryable(e),
        });
      }
    },
    [endpoints, info.maxFileBytes, update],
  );

  useEffect(() => {
    let slots =
      CONCURRENCY - items.filter((i) => i.status === "uploading").length;
    for (const it of items) {
      if (slots <= 0) break;
      if (it.status === "queued" && !started.current.has(it.id)) {
        started.current.add(it.id);
        slots--;
        void run(it);
      }
    }
  }, [items, run]);

  function addFiles(files: FileList | File[]) {
    const next: Item[] = Array.from(files).map((file) => {
      const id = crypto.randomUUID();
      const okType = info.allowedMimePrefixes.some((p) =>
        file.type.toLowerCase().startsWith(p),
      );
      let error: string | undefined;
      if (!okType) error = "Only photos and videos can be uploaded.";
      else if (file.size === 0) error = "This file is empty.";
      else if (file.size > info.maxFileBytes)
        error = `This file is too large (max ${formatBytes(info.maxFileBytes)}).`;
      if (error) started.current.add(id);
      return { id, file, status: error ? "error" : "queued", sent: 0, error };
    });
    setItems((cur) => [...cur, ...next]);
  }

  function retry(id: string) {
    started.current.delete(id);
    update(id, { status: "queued", error: undefined });
  }

  function remove(id: string) {
    setItems((cur) => cur.filter((i) => i.id !== id));
  }

  const active = items.some(
    (i) => i.status === "queued" || i.status === "uploading",
  );
  useWakeLock(active);
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const done = items.filter((i) => i.status === "done").length;

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <BandPhoto name={info.bandName} url={info.bandPhotoUrl} />
        <div>
          <p className="text-sm text-muted-foreground">{info.bandName}</p>
          <h1 className="mt-1 text-xl font-semibold text-balance">
            Upload your photos and videos from {info.gigTitle} (
            {formatGigDate(info.gigDate)})
          </h1>
        </div>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Who&apos;s uploading? (optional)
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="Your name"
          autoComplete="name"
          data-testid="uploader-name"
        />
      </label>

      <label
        data-testid="public-upload-drop"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed bg-card px-4 py-10 text-center transition-colors focus-within:ring-3 focus-within:ring-ring/50",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <ImagePlus className="size-9 text-primary" />
        <span className="text-lg font-semibold">Add photos and videos</span>
        <span className="text-sm text-muted-foreground">
          Tap to choose, or drop files here
        </span>
        <input
          type="file"
          multiple
          accept={info.allowedMimePrefixes.map((p) => `${p}*`).join(",")}
          className="sr-only"
          data-testid="public-upload-input"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {active ? (
        <p
          role="status"
          className="rounded-2xl bg-muted px-4 py-3 text-center text-sm"
        >
          Keep this page open until uploads finish.
        </p>
      ) : done > 0 ? (
        <p
          role="status"
          data-testid="upload-all-done"
          className="rounded-2xl bg-primary/10 px-4 py-3 text-center text-sm font-medium"
        >
          Thank you! {done} {done === 1 ? "file" : "files"} uploaded.
        </p>
      ) : null}

      {items.length ? (
        <ul className="flex flex-col gap-2" data-testid="upload-list">
          {items.map((it) => (
            <Row
              key={it.id}
              item={it}
              onRetry={() => retry(it.id)}
              onRemove={() => remove(it.id)}
            />
          ))}
        </ul>
      ) : null}
    </>
  );
}

function BandPhoto({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="size-20 rounded-2xl object-cover shadow-soft"
      />
    );
  }
  return (
    <div className="flex size-20 items-center justify-center rounded-2xl bg-muted text-2xl font-semibold text-muted-foreground">
      {name.trim().slice(0, 2).toUpperCase()}
    </div>
  );
}

function Row({
  item,
  onRetry,
  onRemove,
}: {
  item: Item;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const pct = Math.min(100, Math.round((item.sent / item.file.size) * 100));
  return (
    <li
      data-testid="upload-row"
      data-status={item.status}
      className="flex flex-col gap-2 rounded-2xl border bg-card p-3"
    >
      <div className="flex items-center gap-2">
        {item.status === "done" ? (
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
        ) : item.status === "error" ? (
          <AlertCircle className="size-5 shrink-0 text-destructive" />
        ) : (
          <Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.file.name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatBytes(item.file.size)}
        </span>
        {item.status === "error" ? (
          <>
            {item.retryable ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Retry"
                onClick={onRetry}
              >
                <RotateCw />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove"
              onClick={onRemove}
            >
              <X />
            </Button>
          </>
        ) : null}
      </div>
      {item.status === "error" ? (
        <p className="text-xs text-destructive">{item.error}</p>
      ) : (
        <div
          role="progressbar"
          aria-valuenow={item.status === "done" ? 100 : pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${item.status === "done" ? 100 : pct}%` }}
          />
        </div>
      )}
      {item.status === "queued" ? (
        <p className="text-xs text-muted-foreground">Waiting</p>
      ) : null}
    </li>
  );
}

/** Holds a screen wake lock while `active`, re-acquiring after tab switches. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      try {
        const l = await navigator.wakeLock.request("screen");
        if (stopped) void l.release();
        else lock = l;
      } catch {
        // Denied or unsupported: uploads continue without it.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
