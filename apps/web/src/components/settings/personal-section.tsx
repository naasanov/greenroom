"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { PresetInstrumentKey, User } from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { InstrumentPicker } from "@/components/app/instrument-picker";
import { findInstrument } from "@/components/app/instruments";
import { SavedNote, SectionCard } from "@/components/settings/section-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMyInstruments, useSaveProfile, useSignOut } from "@/lib/queries";

const personalSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
});

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

function PersonalForm({
  user,
  initialInstruments,
}: {
  user: User;
  initialInstruments: string[];
}) {
  const save = useSaveProfile();
  const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(initialInstruments);
  const [instruments, setInstruments] = useState(initialInstruments);
  const form = useForm({
    resolver: zodResolver(personalSchema),
    defaultValues: { displayName: user.displayName },
  });
  const dirty = form.formState.isDirty || !sameSet(instruments, baseline);

  const submit = form.handleSubmit((v) => {
    setSaved(false);
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
      {
        onSuccess: (updated) => {
          form.reset({ displayName: updated.displayName });
          setBaseline(instruments);
          setSaved(true);
        },
      },
    );
  });

  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={submit}>
      <FormField label="Your name" htmlFor="settings-display-name">
        <Input
          id="settings-display-name"
          autoComplete="name"
          maxLength={100}
          aria-invalid={!!form.formState.errors.displayName}
          {...form.register("displayName", { onChange: () => setSaved(false) })}
        />
        {form.formState.errors.displayName ? (
          <p role="alert" className="text-sm text-destructive">
            Enter the name your bandmates know you by.
          </p>
        ) : null}
      </FormField>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">What do you play?</p>
        <InstrumentPicker
          value={instruments}
          onChange={(v) => {
            setSaved(false);
            setInstruments(v);
          }}
        />
      </div>

      {save.isError ? (
        <p role="alert" className="text-sm text-destructive">
          We could not save your profile. Please try again.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={save.isPending || !dirty}>
          {save.isPending ? "Saving..." : "Save profile"}
        </Button>
        <SavedNote show={saved && !dirty} />
      </div>
    </form>
  );
}

/** Name, photo, instruments, and sign out. */
export function PersonalSection({ user }: { user: User }) {
  const mine = useMyInstruments();
  const signOut = useSignOut();

  return (
    <SectionCard
      id="settings-personal"
      title="Personal"
      testId="settings-personal"
    >
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-secondary text-xl font-semibold text-secondary-foreground">
            {user.displayName.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span
            data-testid="settings-name"
            className="truncate text-lg font-semibold"
          >
            {user.displayName}
          </span>
          <span
            data-testid="settings-email"
            className="truncate text-sm text-muted-foreground"
          >
            {user.email}
          </span>
        </div>
      </div>

      {mine.data ? (
        <PersonalForm
          user={user}
          initialInstruments={[...mine.data.presets, ...mine.data.custom]}
        />
      ) : mine.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load your instruments.
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading...
        </p>
      )}

      <Button
        variant="outline"
        size="lg"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        Sign out
      </Button>
    </SectionCard>
  );
}
