import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata("Files");

import { FilesTab } from "@/components/files/files-tab";

export default function FilesPage() {
  return <FilesTab />;
}
