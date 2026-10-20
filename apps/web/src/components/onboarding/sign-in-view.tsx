"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { MailCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { magicLinkRequestSchema } from "@greenroom/shared";
import { z } from "zod";
import { FormField } from "@/components/app/form-field";
import {
  AuthLayout,
  Brand,
  GoogleIcon,
} from "@/components/onboarding/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiUrl, isApiError } from "@/lib/api";
import { requestMagicLink, useMe } from "@/lib/queries";
import { safeRedirectTo } from "@/lib/redirect";

const emailSchema = magicLinkRequestSchema.pick({ email: true });

const GOOGLE_ERRORS: Record<string, string> = {
  invalid_state: "That Google sign-in expired. Please try again.",
  invalid_code: "Google could not confirm your account. Please try again.",
  account_conflict: "That Google account is linked to a different login.",
  google_denied: "Google sign-in was cancelled.",
};

export function SignInView() {
  const params = useSearchParams();
  const router = useRouter();
  const redirectTo = safeRedirectTo(params.get("redirectTo"));
  const errorCode = params.get("error");
  const me = useMe();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  // A valid session on arrival skips straight to the destination.
  useEffect(() => {
    if (me.data) router.replace(redirectTo);
  }, [me.data, redirectTo, router]);

  const form = useForm<
    z.input<typeof emailSchema>,
    unknown,
    z.output<typeof emailSchema>
  >({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const send = useMutation({
    mutationFn: (email: string) => requestMagicLink({ email, redirectTo }),
    onSuccess: (_, email) => setSentTo(email),
  });

  function googleUrl() {
    const afterGoogle = `/welcome?redirectTo=${encodeURIComponent(redirectTo)}`;
    return `${getApiUrl()}/auth/google/start?redirectTo=${encodeURIComponent(afterGoogle)}`;
  }

  const sendError = send.error
    ? isApiError(send.error, 429)
      ? "Too many emails sent. Please wait a few minutes and try again."
      : "We could not send the email. Please try again."
    : null;

  if (sentTo) {
    return (
      <AuthLayout>
        <Brand className="justify-center" />
        <div className="flex flex-col items-center gap-4 rounded-3xl border bg-card p-6 text-center shadow-soft">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-gig-soft text-gig-soft-foreground">
            <MailCheck className="size-7" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h1 className="text-xl font-semibold">Check your email</h1>
            <p className="text-sm text-muted-foreground">
              We sent a sign-in link to{" "}
              <span className="font-medium text-foreground">{sentTo}</span>. It
              expires in 15 minutes.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <Button
              variant="outline"
              disabled={send.isPending}
              onClick={() => {
                setResent(false);
                send.mutate(sentTo, { onSuccess: () => setResent(true) });
              }}
            >
              {send.isPending ? "Sending..." : "Resend email"}
            </Button>
            {resent ? (
              <p role="status" className="text-sm text-muted-foreground">
                Sent again.
              </p>
            ) : null}
            {sendError ? (
              <p role="alert" className="text-sm text-destructive">
                {sendError}
              </p>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                setSentTo(null);
                setResent(false);
                send.reset();
              }}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="flex flex-col items-center gap-3 text-center">
        <Brand />
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Your band&apos;s home base
        </h1>
        <p className="text-sm text-muted-foreground">
          Gigs, practices, and setlists in one place.
        </p>
      </div>

      <div className="flex flex-col gap-5 rounded-3xl border bg-card p-5 shadow-soft">
        {errorCode ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
          >
            {GOOGLE_ERRORS[errorCode] ?? "Sign-in failed. Please try again."}
          </p>
        ) : null}

        <Button variant="outline" size="lg" asChild>
          <a href={googleUrl()}>
            <GoogleIcon className="size-5" />
            Continue with Google
          </a>
        </Button>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or use email
          <span className="h-px flex-1 bg-border" />
        </div>

        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={form.handleSubmit((v) => send.mutate(v.email))}
        >
          <FormField label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              aria-invalid={!!form.formState.errors.email}
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p role="alert" className="text-sm text-destructive">
                Enter a valid email address.
              </p>
            ) : null}
          </FormField>
          {sendError ? (
            <p role="alert" className="text-sm text-destructive">
              {sendError}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={send.isPending}>
            {send.isPending ? "Sending..." : "Email me a sign-in link"}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
