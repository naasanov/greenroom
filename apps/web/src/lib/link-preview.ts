import { headers } from "next/headers";
import type { Metadata } from "next";
import { parseGigId } from "@greenroom/shared";

const SUFFIX = "Greenroom";

/** Title plus matching og/twitter tags so link unfurlers show the same text. */
export function previewMetadata(page: string | null): Metadata {
  const title = page ? `${page} | ${SUFFIX}` : SUFFIX;
  return {
    title,
    openGraph: { title, siteName: SUFFIX, type: "website" },
    twitter: { card: "summary", title },
  };
}

/** Mirrors the browser's API origin rules using the incoming request host. */
async function apiOrigin(): Promise<string | null> {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const [hostname, port] = host.split(":");
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `http://${hostname}:${Number(port || 80) + 1000}`;
  }
  return `https://api.${hostname}`;
}

async function fetchTitle(
  kind: "songs" | "gigs",
  id: string,
): Promise<string | null> {
  try {
    const origin = await apiOrigin();
    if (!origin) return null;
    const res = await fetch(
      `${origin}/public/link-preview/${kind}/${encodeURIComponent(id)}`,
      { signal: AbortSignal.timeout(2500), next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { title?: unknown };
    return typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : null;
  } catch {
    return null;
  }
}

export async function songPreview(songId: string): Promise<Metadata> {
  return previewMetadata(await fetchTitle("songs", songId));
}

/** Accepts the `<slug>-<uuid>` route param. */
export async function gigPreview(gigParam: string): Promise<Metadata> {
  return previewMetadata(await fetchTitle("gigs", parseGigId(gigParam)));
}
