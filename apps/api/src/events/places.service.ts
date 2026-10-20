import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  GOOGLE_PLACES,
  type GooglePlacesAdapter,
  type PlaceDetails,
  type PlacePrediction,
} from "../integrations/index.js";

@Injectable()
export class PlacesService {
  constructor(
    @Inject(GOOGLE_PLACES) private readonly places: GooglePlacesAdapter,
  ) {}

  autocomplete(q: string): Promise<PlacePrediction[]> {
    return this.places.autocomplete(q);
  }

  async details(placeId: string): Promise<PlaceDetails> {
    const res = await this.places.getDetails(placeId);
    if (res.status !== "ok") throw new NotFoundException("Place not found");
    return res.place;
  }
}
