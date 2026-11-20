"use client";

import { GoogleSettings } from "@/components/google/google-settings";
import { CalendarInvitesRow } from "@/components/settings/calendar-invites-row";
import { SectionCard } from "@/components/settings/section-card";
import { SpotifyRow } from "@/components/settings/spotify-row";
import type { User } from "@greenroom/shared";

/** Spotify and calendar for everyone; Google Drive controls only for band admins. */
export function ConnectionsSection({
  user,
  bandId,
  isAdmin,
}: {
  user: User;
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
      <CalendarInvitesRow
        userId={user.id}
        bandId={bandId}
        invitesEnabled={user.calendarInvitesEnabled}
      />
      {isAdmin ? <GoogleSettings bandId={bandId} /> : null}
    </SectionCard>
  );
}
