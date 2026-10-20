import { notImplemented } from "../not-implemented.js";
import type {
  GooglePlacesAdapter,
  PlaceDetailsResult,
  PlacePrediction,
} from "./google-places.adapter.js";

export class RealGooglePlacesAdapter implements GooglePlacesAdapter {
  autocomplete(): Promise<PlacePrediction[]> {
    return notImplemented("GooglePlaces", "3.1");
  }
  getDetails(): Promise<PlaceDetailsResult> {
    return notImplemented("GooglePlaces", "3.1");
  }
}
