import type { ReactNode } from "react";
import { previewMetadata } from "@/lib/link-preview";

export const metadata = previewMetadata("Roster");

export default function RosterLayout({ children }: { children: ReactNode }) {
  return children;
}
