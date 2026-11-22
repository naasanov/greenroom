import { BANDS } from "@greenroom/db";

export const bandSettingsUrl = (bandId: string) => `/bands/${bandId}/settings`;

/** Settings page of the seeded band most specs act on. */
export const NIGHT_OWLS_SETTINGS = bandSettingsUrl(BANDS.nightOwls.id);
