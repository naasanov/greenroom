import type {
  GooglePlacesAdapter,
  PlaceDetails,
  PlaceDetailsResult,
  PlacePrediction,
} from "./google-places.adapter.js";

const DEFAULT_PLACES: PlaceDetails[] = [
  {
    placeId: "fake-place-bowery",
    name: "Bowery Ballroom",
    address: "6 Delancey St, New York, NY 10002, USA",
    lat: 40.7204,
    lng: -73.9937,
    photoUrls: ["https://fake-places.test/photos/bowery-1.jpg"],
  },
  {
    placeId: "fake-place-troubadour",
    name: "The Troubadour",
    address: "9081 Santa Monica Blvd, West Hollywood, CA 90069, USA",
    lat: 34.0807,
    lng: -118.3893,
    photoUrls: ["https://fake-places.test/photos/troubadour-1.jpg"],
  },
  {
    placeId: "fake-place-exit-in",
    name: "Exit/In",
    address: "2208 Elliston Pl, Nashville, TN 37203, USA",
    lat: 36.1522,
    lng: -86.8032,
    photoUrls: [],
  },
];

export class FakeGooglePlacesAdapter implements GooglePlacesAdapter {
  private places = new Map<string, PlaceDetails>();

  constructor() {
    this.reset();
  }

  async autocomplete(query: string): Promise<PlacePrediction[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return [...this.places.values()]
      .filter((p) => `${p.name} ${p.address}`.toLowerCase().includes(q))
      .map((p) => ({
        placeId: p.placeId,
        description: `${p.name}, ${p.address}`,
      }));
  }

  async getDetails(placeId: string): Promise<PlaceDetailsResult> {
    const p = this.places.get(placeId);
    return p
      ? { status: "ok", place: { ...p, photoUrls: [...p.photoUrls] } }
      : { status: "not-found" };
  }

  // ---- test controls ----

  seedPlace(place: PlaceDetails): void {
    this.places.set(place.placeId, place);
  }

  reset(): void {
    this.places = new Map(DEFAULT_PLACES.map((p) => [p.placeId, p]));
  }
}
