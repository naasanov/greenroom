import type { Metadata } from "next";
import { Suspense } from "react";
import { InviteView } from "@/components/onboarding/invite-view";

export const metadata: Metadata = { title: "Join a band | Greenroom" };

export default function InvitePage() {
  return (
    <Suspense>
      <InviteView />
    </Suspense>
  );
}
