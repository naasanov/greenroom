import type { ReactNode } from "react";
import { RoutedShell } from "@/components/app/routed-shell";
import { StageOfflineSync } from "@/components/stage/offline-sync";
import { UploadProvider } from "@/components/media/upload/upload-provider";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      <StageOfflineSync />
      <RoutedShell>{children}</RoutedShell>
    </UploadProvider>
  );
}
