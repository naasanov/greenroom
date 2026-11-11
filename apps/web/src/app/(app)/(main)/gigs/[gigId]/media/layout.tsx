import type { ReactNode } from "react";
import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata("Media");

export default function MediaLayout({ children }: { children: ReactNode }) {
  return children;
}
