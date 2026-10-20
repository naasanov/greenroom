"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { PresetInstrumentKey, User } from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { InstrumentPicker } from "@/components/app/instrument-picker";
import { findInstrument } from "@/components/app/instruments";
import { AuthLayout, Brand } from "@/components/onboarding/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMe, useSaveProfile } from "@/lib/queries";
import { safeRedirectTo, signInUrl } from "@/lib/redirect";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

function ProfileForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [instruments, setInstruments] = useState<string[]>([]);
  const save = useSaveProfile();
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: user.displayName },
  });

  const submit = form.handleSubmit((v) =>
    save.mutate(
      {
        profile: { displayName: v.displayName },
        instruments: {
          presets: instruments.filter((i) =>
            findInstrument(i),
          ) as PresetInstrumentKey[],
          custom: instruments.filter((i) => !findInstrument(i)),
        },
      },
      { onSuccess: onDone },
    ),
  );

  return (
    <form noValidate className="flex flex-col gap-6" onSubmit={submit}>
      <div className="flex flex-col gap-6">
        <FormField label="Your name" htmlFor="displayName">
          <Input
            id="displayName"
            autoComplete="name"
            aria-invalid={!!form.formState.errors.displayName}
            {...form.register("displayName")}
          />
          {form.formState.errors.displayName ? (
            <p role="alert" className="text-sm text-destructive">
              Enter the name your bandmates know you by.
            </p>
          ) : null}
        </FormField>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">What do you play?</p>
        <InstrumentPicker value={instruments} onChange={setInstruments} />
      </div>

      {save.isError ? (
        <p role="alert" className="text-sm text-destructive">
          We could not save your profile. Please try again.
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={save.isPending}>
        {save.isPending ? "Saving..." : "Continue"}
      </Button>
    </form>
  );
}

export function WelcomeView() {
  const router = useRouter();
  const dest = safeRedirectTo(useSearchParams().get("redirectTo"));
  const me = useMe();

  useEffect(() => {
    if (me.isSuccess && !me.data) router.replace(signInUrl("/welcome"));
  }, [me.isSuccess, me.data, router]);

  return (
    <AuthLayout className="max-w-lg">
      <Brand className="justify-center" />
      <div className="flex flex-col gap-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Greenroom
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell your bandmates who you are and what you play.
        </p>
      </div>
      <div className="rounded-3xl border bg-card p-5 shadow-soft">
        {me.data ? (
          <ProfileForm user={me.data} onDone={() => router.replace(dest)} />
        ) : (
          <p
            role="status"
            className="py-8 text-center text-sm text-muted-foreground"
          >
            Loading...
          </p>
        )}
      </div>
    </AuthLayout>
  );
}
