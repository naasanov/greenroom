import type { Metadata } from "next";
import { Suspense } from "react";
import { WelcomeView } from "@/components/onboarding/welcome-view";

export const metadata: Metadata = { title: "Welcome | Greenroom" };

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeView />
    </Suspense>
  );
}
