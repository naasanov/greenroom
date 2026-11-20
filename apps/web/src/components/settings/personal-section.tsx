"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userSchema, type UpdateProfile, type User } from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { InstrumentsAutosave } from "@/components/settings/instruments-autosave";
import { SavedNote, SectionCard } from "@/components/settings/section-card";
import { PhotoUpload } from "@/components/app/photo-upload";
import { MemberAvatar } from "@/components/roster/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { keys, useMyInstruments } from "@/lib/queries";
import { useMyPhoto } from "@/lib/queries/photos";

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

function useProfileForm(user: User) {
  const save = useSaveProfileFields();
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(personalSchema),
    defaultValues: {
      displayName: user.displayName,
      calendarEmail: user.calendarEmail ?? "",
    },
  });

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

  return { form, save, saved, setSaved, submit };
}

const ProfileFormContext = createContext<ReturnType<
  typeof useProfileForm
> | null>(null);

function useProfileFormContext() {
  const ctx = useContext(ProfileFormContext);
  if (!ctx) throw new Error("Profile form context is missing");
  return ctx;
}

const PROFILE_FORM_ID = "settings-profile-form";

/** Owns the name and calendar email form shared by the fields and the page-bottom Save button. */
export function ProfileFormProvider({
  user,
  children,
}: {
  user: User;
  children: ReactNode;
}) {
  return (
    <ProfileFormContext.Provider value={useProfileForm(user)}>
      {children}
    </ProfileFormContext.Provider>
  );
}

/** Save button for the profile fields, rendered at the bottom of the Profile tab. */
export function SaveProfileBar() {
  const { form, save, saved } = useProfileFormContext();
  const dirty = form.formState.isDirty;
  return (
    <div data-testid="settings-profile-save" className="flex flex-col gap-3">
      {save.isError ? (
        <p role="alert" className="text-sm text-destructive">
          We could not save your profile. Please try again.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          form={PROFILE_FORM_ID}
          size="lg"
          disabled={save.isPending || !dirty}
        >
          {save.isPending ? "Saving..." : "Save profile"}
        </Button>
        <SavedNote show={saved && !dirty} />
      </div>
    </div>
  );
}

function PersonalForm({ user }: { user: User }) {
  const { form, setSaved, submit } = useProfileFormContext();

  return (
    <form
      id={PROFILE_FORM_ID}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={submit}
    >
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
        hint="Where calendar invites go if you turn them on. Leave empty to use your sign-in email."
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
    </form>
  );
}

/** The user's single profile photo, used across the app and mirrored to band Drives. */
function ProfilePhotoRow({ user }: { user: User }) {
  const photo = useMyPhoto();
  return (
    <PhotoUpload
      testId="profile-photo-row"
      title="Your photo"
      hasPhoto={!!user.avatarUrl}
      preview={
        <MemberAvatar
          member={{ ...user, userId: user.id }}
          className="size-16"
        />
      }
      onUpload={(file) => photo.upload.mutateAsync(file)}
      onRemove={() => photo.remove.mutateAsync()}
    />
  );
}

/** Name, photo, and instruments. */
export function PersonalSection({ user }: { user: User }) {
  const mine = useMyInstruments();

  return (
    <SectionCard
      id="settings-personal"
      title="Personal"
      testId="settings-personal"
    >
      <div className="flex items-center gap-4">
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

      <ProfilePhotoRow user={user} />

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
    </SectionCard>
  );
}
