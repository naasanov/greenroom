import type {
  GooglePlacesAdapter,
  PlaceDetailsResult,
  PlacePrediction,
} from "./google-places.adapter.js";

const BASE_URL = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 5000;
const MAX_PREDICTIONS = 5;
const MAX_PHOTOS = 3;
const DETAILS_FIELDS = "id,displayName,formattedAddress,location,photos";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  return key;
}

/** Talks to the Places API (New) over fetch; the key travels only in headers. */
export class RealGooglePlacesAdapter implements GooglePlacesAdapter {
  async autocomplete(query: string): Promise<PlacePrediction[]> {
    const input = query.trim();
    if (!input) return [];
    const res = await fetch(`${BASE_URL}/places:autocomplete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey(),
      },
      body: JSON.stringify({ input }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Places autocomplete failed with status ${res.status}`);
    }
    const suggestions = asRecord(await res.json()).suggestions;
    if (!Array.isArray(suggestions)) return [];
    const out: PlacePrediction[] = [];
    for (const s of suggestions) {
      const p = asRecord(asRecord(s).placePrediction);
      const text = asRecord(p.text).text;
      if (typeof p.placeId === "string" && typeof text === "string") {
        out.push({ placeId: p.placeId, description: text });
      }
      if (out.length >= MAX_PREDICTIONS) break;
    }
    return out;
  }

  async getDetails(placeId: string): Promise<PlaceDetailsResult> {
    const key = apiKey();
    const res = await fetch(
      `${BASE_URL}/places/${encodeURIComponent(placeId)}`,
      {
        headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_FIELDS },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (res.status === 404 || res.status === 400) {
      return { status: "not-found" };
    }
    if (!res.ok) {
      throw new Error(`Places details failed with status ${res.status}`);
    }
    const data = asRecord(await res.json());
    const loc = asRecord(data.location);
    if (
      typeof data.id !== "string" ||
      typeof loc.latitude !== "number" ||
      typeof loc.longitude !== "number"
    ) {
      return { status: "not-found" };
    }
    const address =
      typeof data.formattedAddress === "string" ? data.formattedAddress : "";
    const name = asRecord(data.displayName).text;
    const photoNames = (Array.isArray(data.photos) ? data.photos : [])
      .map((p) => asRecord(p).name)
      .filter((n): n is string => typeof n === "string" && n.length > 0)
      .slice(0, MAX_PHOTOS);
    const photoUrls = (
      await Promise.all(photoNames.map((n) => this.photoUrl(n, key)))
    ).filter((u): u is string => u !== null);
    return {
      status: "ok",
      place: {
        placeId: data.id,
        name: typeof name === "string" && name ? name : address,
        address,
        lat: loc.latitude,
        lng: loc.longitude,
        photoUrls,
      },
    };
  }

  /** Resolves a photo resource to its keyless CDN URL; null on any failure. */
  private async photoUrl(
    photoName: string,
    key: string,
  ): Promise<string | null> {
    try {
      const res = await fetch(
        `${BASE_URL}/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
        {
          headers: { "X-Goog-Api-Key": key },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) return null;
      const uri = asRecord(await res.json()).photoUri;
      return typeof uri === "string" && uri ? uri : null;
    } catch {
      return null;
    }
  }
}
