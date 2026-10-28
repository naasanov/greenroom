import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicUploadView } from "@/components/public-upload/public-upload-view";

export const metadata: Metadata = {
  title: "Upload photos and videos | Greenroom",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PublicUploadPage() {
  return (
    <Suspense>
      <PublicUploadView />
    </Suspense>
  );
}
