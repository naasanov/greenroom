"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthLayout, Brand } from "@/components/onboarding/auth-layout";
import { Button } from "@/components/ui/button";
import { verifyMagicLink } from "@/lib/queries";
import { safeRedirectTo } from "@/lib/redirect";

/** Verifies the emailed token once, then routes new users to /welcome. */
export function CallbackView() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const qc = useQueryClient();
  const started = useRef(false);
  const [failed, setFailed] = useState(!token);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    verifyMagicLink(token, qc).then(
      (result) => {
        const dest = safeRedirectTo(result.redirectTo);
        router.replace(
          result.isNewUser
            ? `/welcome?redirectTo=${encodeURIComponent(dest)}`
            : dest,
        );
      },
      () => setFailed(true),
    );
  }, [token, qc, router]);

  return (
    <AuthLayout>
      <Brand className="justify-center" />
      {failed ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border bg-card p-6 text-center shadow-soft">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold">This link did not work</h1>
            <p className="text-sm text-muted-foreground">
              Sign-in links expire after 15 minutes and can only be used once.
              Request a fresh one.
            </p>
          </div>
          <Button asChild size="lg" className="w-full">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <p
          role="status"
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          Signing you in...
        </p>
      )}
    </AuthLayout>
  );
}
