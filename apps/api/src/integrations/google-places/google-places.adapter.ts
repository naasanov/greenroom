export const GOOGLE_PLACES = Symbol("GOOGLE_PLACES");

export interface PlacePrediction {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  photoUrls: string[];
}

export type PlaceDetailsResult =
  { status: "ok"; place: PlaceDetails } | { status: "not-found" };

export interface GooglePlacesAdapter {
  autocomplete(query: string): Promise<PlacePrediction[]>;
  getDetails(placeId: string): Promise<PlaceDetailsResult>;
}
