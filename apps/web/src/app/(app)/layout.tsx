import { Suspense, type ReactNode } from "react";
import { AuthGate } from "@/components/onboarding/auth-gate";

// Dynamic deep-link routes make the pathname a runtime value, so the gate streams in.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
