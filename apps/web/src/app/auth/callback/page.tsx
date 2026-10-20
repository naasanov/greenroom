import type { Metadata } from "next";
import { Suspense } from "react";
import { CallbackView } from "@/components/onboarding/callback-view";

export const metadata: Metadata = { title: "Signing in | Greenroom" };

export default function CallbackPage() {
  return (
    <Suspense>
      <CallbackView />
    </Suspense>
  );
}
