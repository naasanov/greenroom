import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata("Band settings");

import { BandSettingsView } from "@/components/settings/band-settings-view";

export default async function BandSettingsPage({
  params,
}: {
  params: Promise<{ bandId: string }>;
}) {
  return <BandSettingsView bandId={(await params).bandId} />;
}
