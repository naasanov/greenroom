import type { FileEntry } from "@greenroom/shared";
import { mediaPath } from "@/lib/gig-path";

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "none";

export const isGoogleDoc = (e: FileEntry) =>
  !!e.mimeType?.startsWith("application/vnd.google-apps.");

/** Drive's own page for a file, which opens Google Docs, Sheets and Slides. */
export const driveOpenUrl = (e: FileEntry) =>
  `https://drive.google.com/open?id=${encodeURIComponent(e.id)}`;

export function previewKind(e: FileEntry): PreviewKind {
  const m = e.mimeType ?? "";
  if (isGoogleDoc(e)) return "none";
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf") return "pdf";
  return "none";
}

/** Gig folders and the gigs root cannot be trashed; the API refuses them. */
export const isProtected = (e: FileEntry) => e.isGigsRoot || !!e.gig;

/** Where activating an entry goes: its folder listing, or the gig's media page. */
export function entryHref(e: FileEntry): string | null {
  if (e.kind !== "folder") return null;
  if (e.gig) return mediaPath(e.gig.id);
  return `/files/${e.id}`;
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

export function formatModified(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** A gig's `YYYY-MM-DD` date as a short local date. */
export function formatGigDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
