import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInView } from "@/components/onboarding/sign-in-view";

export const metadata: Metadata = { title: "Sign in | Greenroom" };

export default function SignInPage() {
  return (
    <Suspense>
      <SignInView />
    </Suspense>
  );
}
