import type { ReactNode } from "react";
import { RoutedShell } from "@/components/app/routed-shell";
import { StageOfflineSync } from "@/components/stage/offline-sync";
import { GlobalUploadIndicator } from "@/components/media/upload/global-upload-indicator";
import { UploadProvider } from "@/components/media/upload/upload-provider";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      <StageOfflineSync />
      <GlobalUploadIndicator />
      <RoutedShell>{children}</RoutedShell>
    </UploadProvider>
  );
}
