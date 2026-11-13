"use client";

import { GoogleSettings } from "@/components/google/google-settings";
import { SectionCard } from "@/components/settings/section-card";
import { SpotifyRow } from "@/components/settings/spotify-row";

/** Spotify for everyone; Google Drive controls only for band admins. */
export function ConnectionsSection({
  bandId,
  isAdmin,
}: {
  bandId: string;
  isAdmin: boolean;
}) {
  return (
    <SectionCard
      id="settings-connections"
      title="Connections"
      testId="settings-connections"
    >
      <SpotifyRow />
      {isAdmin ? <GoogleSettings bandId={bandId} /> : null}
    </SectionCard>
  );
}
