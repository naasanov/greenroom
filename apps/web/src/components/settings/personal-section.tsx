"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userSchema, type UpdateProfile, type User } from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { InstrumentsAutosave } from "@/components/settings/instruments-autosave";
import { SpotifyRow } from "@/components/settings/spotify-row";
import { SavedNote, SectionCard } from "@/components/settings/section-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhotoUpload } from "@/components/app/photo-upload";
import { MemberAvatar } from "@/components/roster/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useCurrentBand } from "@/lib/current-band";
import { keys, useMembers, useMyInstruments, useSignOut } from "@/lib/queries";
import {
  NOT_LINKED_NOTE,
  useDriveStatus,
  useMyBandPhoto,
} from "@/lib/queries/photos";

/** Saves name and calendar email only; instruments autosave separately. */
function useSaveProfileFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profile: UpdateProfile) =>
      api("/auth/me", { method: "PATCH", body: profile, schema: userSchema }),
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user);
      void qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "bands" && q.queryKey[2] === "members",
      });
    },
  });
}

const personalSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  calendarEmail: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || z.string().email().safeParse(v).success),
});

function PersonalForm({ user }: { user: User }) {
  const save = useSaveProfileFields();
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      displayName: user.displayName,
      calendarEmail: user.calendarEmail ?? "",
    },
  });
  const dirty = form.formState.isDirty;

  const submit = form.handleSubmit((v) => {
    setSaved(false);
    save.mutate(
      {
        displayName: v.displayName,
        calendarEmail: v.calendarEmail === "" ? null : v.calendarEmail,
      },
      {
        onSuccess: (updated) => {
          form.reset({
            displayName: updated.displayName,
            calendarEmail: updated.calendarEmail ?? "",
          });
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

      <FormField
        label="Calendar email"
        htmlFor="settings-calendar-email"
        hint="Gig and practice invites go here. Leave empty to use your sign-in email."
      >
        <Input
          id="settings-calendar-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          placeholder={user.email}
          aria-invalid={!!form.formState.errors.calendarEmail}
          {...form.register("calendarEmail", {
            onChange: () => setSaved(false),
          })}
        />
        {form.formState.errors.calendarEmail ? (
          <p role="alert" className="text-sm text-destructive">
            Enter a valid email address.
          </p>
        ) : null}
      </FormField>

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

/** The member's photo for the current band, disabled until the band's Drive is set up. */
function MemberPhotoRow({
  user,
  band,
}: {
  user: User;
  band: { id: string; name: string };
}) {
  const members = useMembers(band.id);
  const status = useDriveStatus(band.id);
  const photo = useMyBandPhoto(band.id);
  const mine = members.data?.find((m) => m.userId === user.id);
  const member = {
    userId: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    photoUrl: mine?.photoUrl ?? null,
  };
  return (
    <PhotoUpload
      testId="member-photo-row"
      title={`Your photo in ${band.name}`}
      hasPhoto={!!member.photoUrl}
      loading={status.isPending || members.isPending}
      disabledNote={status.data?.folderSet === false ? NOT_LINKED_NOTE : null}
      preview={<MemberAvatar member={member} className="size-16" />}
      onUpload={(file) => photo.upload.mutateAsync(file)}
      onRemove={() => photo.remove.mutateAsync()}
    />
  );
}

/** Name, photo, instruments, and sign out. */
export function PersonalSection({ user }: { user: User }) {
  const mine = useMyInstruments();
  const signOut = useSignOut();
  const { currentBand } = useCurrentBand();

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

      {currentBand ? (
        <MemberPhotoRow key={currentBand.id} user={user} band={currentBand} />
      ) : null}

      {mine.data ? (
        <>
          <PersonalForm user={user} />
          <InstrumentsAutosave
            initial={[...mine.data.presets, ...mine.data.custom]}
          />
        </>
      ) : mine.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load your instruments.
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading...
        </p>
      )}

      <SpotifyRow />

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
