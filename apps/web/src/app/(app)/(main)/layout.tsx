import type { ReactNode } from "react";
import { RoutedShell } from "@/components/app/routed-shell";
import { UploadProvider } from "@/components/media/upload/upload-provider";

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <UploadProvider>
      <RoutedShell>{children}</RoutedShell>
    </UploadProvider>
  );
}
