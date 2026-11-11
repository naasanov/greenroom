import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata("Settings");

import { SettingsView } from "@/components/settings/settings-view";

export default function SettingsPage() {
  return <SettingsView />;
}
