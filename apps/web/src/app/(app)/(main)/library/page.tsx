import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata("Library");

import { LibraryTab } from "@/components/onboarding/library-tab";

export default function LibraryPage() {
  return <LibraryTab />;
}
