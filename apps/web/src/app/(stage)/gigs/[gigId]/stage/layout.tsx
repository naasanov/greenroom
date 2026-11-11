import type { ReactNode } from "react";
import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata("Stage");

export default function StageLayout({ children }: { children: ReactNode }) {
  return children;
}
