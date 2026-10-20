import type { ReactNode } from "react";
import { RoutedShell } from "@/components/app/routed-shell";

export default function MainLayout({ children }: { children: ReactNode }) {
  return <RoutedShell>{children}</RoutedShell>;
}
