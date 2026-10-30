import { Suspense, type ReactNode } from "react";

// Outside the auth gate on purpose: stage mode must open offline from cached data.
export default function StageLayout({ children }: { children: ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
