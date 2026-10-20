"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { BandDetail, BandSummary } from "@greenroom/shared";
import { BandAvatar } from "@/components/app/band-switcher";
import { FormField } from "@/components/app/form-field";
import { SavedNote, SectionCard } from "@/components/settings/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBandDetail, useUpdateBand } from "@/lib/queries";

const SOCIALS = [
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "instagram.com/yourband",
  },
  { key: "tiktok", label: "TikTok", placeholder: "tiktok.com/@yourband" },
  { key: "youtube", label: "YouTube", placeholder: "youtube.com/@yourband" },
  {
    key: "spotify",
    label: "Spotify",
    placeholder: "open.spotify.com/artist/...",
  },
  { key: "website", label: "Website", placeholder: "yourband.com" },
] as const;

/** Adds https:// when the user typed a bare domain. */
const normalizeUrl = (v: string) =>
  /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;

const isUrl = (v: string) => {
  if (!v) return true;
  try {
    return new URL(normalizeUrl(v)).hostname.includes(".");
  } catch {
    return false;
  }
};

const linkField = z
  .string()
  .trim()
  .max(2000)
  .refine(isUrl, "Enter a valid link, like instagram.com/yourband");

const bandSchema = z.object({
  name: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(2000),
  bookingContact: z
    .string()
    .trim()
    .max(254)
    .refine(
      (v) => !v || z.string().email().safeParse(v).success,
      "Enter a valid email",
    ),
  instagram: linkField,
  tiktok: linkField,
  youtube: linkField,
  spotify: linkField,
  website: linkField,
});
type BandFormValues = z.infer<typeof bandSchema>;

const toValues = (d: BandDetail): BandFormValues => ({
  name: d.name,
  bio: d.bio ?? "",
  bookingContact: d.bookingContact ?? "",
  instagram: d.socialLinks.instagram ?? "",
  tiktok: d.socialLinks.tiktok ?? "",
  youtube: d.socialLinks.youtube ?? "",
  spotify: d.socialLinks.spotify ?? "",
  website: d.socialLinks.website ?? "",
});

function BandForm({ detail }: { detail: BandDetail }) {
  const update = useUpdateBand(detail.id);
  const [saved, setSaved] = useState(false);
  const form = useForm<BandFormValues>({
    resolver: zodResolver(bandSchema),
    defaultValues: toValues(detail),
  });
  const { errors, isDirty } = form.formState;

  const submit = form.handleSubmit((v) => {
    setSaved(false);
    // Links this form does not edit are kept as they are.
    const known = new Set<string>(SOCIALS.map((s) => s.key));
    const socialLinks: Record<string, string> = Object.fromEntries(
      Object.entries(detail.socialLinks).filter(([k]) => !known.has(k)),
    );
    for (const { key } of SOCIALS) {
      if (v[key]) socialLinks[key] = normalizeUrl(v[key]);
    }
    update.mutate(
      {
        name: v.name,
        bio: v.bio || null,
        bookingContact: v.bookingContact || null,
        socialLinks,
      },
      {
        onSuccess: (updated) => {
          form.reset(toValues(updated));
          setSaved(true);
        },
      },
    );
  });

  const clearSaved = { onChange: () => setSaved(false) };

  return (
    <form noValidate className="flex flex-col gap-5" onSubmit={submit}>
      <FormField label="Band name" htmlFor="settings-band-name-input">
        <Input
          id="settings-band-name-input"
          maxLength={100}
          autoComplete="off"
          aria-invalid={!!errors.name}
          {...form.register("name", clearSaved)}
        />
        {errors.name ? (
          <p role="alert" className="text-sm text-destructive">
            Your band needs a name.
          </p>
        ) : null}
      </FormField>

      <div className="flex flex-col gap-4 border-t pt-5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">Public profile</h3>
          <p className="text-xs text-muted-foreground">
            Shown on your public gig calendar page.
          </p>
        </div>
        <FormField label="Bio" htmlFor="settings-band-bio">
          <Textarea
            id="settings-band-bio"
            rows={4}
            maxLength={2000}
            aria-invalid={!!errors.bio}
            {...form.register("bio", clearSaved)}
          />
        </FormField>
        <FormField label="Booking email" htmlFor="settings-band-booking">
          <Input
            id="settings-band-booking"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="booking@yourband.com"
            aria-invalid={!!errors.bookingContact}
            {...form.register("bookingContact", clearSaved)}
          />
          {errors.bookingContact ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.bookingContact.message}
            </p>
          ) : null}
        </FormField>
        {SOCIALS.map((s) => (
          <FormField
            key={s.key}
            label={s.label}
            htmlFor={`settings-band-${s.key}`}
          >
            <Input
              id={`settings-band-${s.key}`}
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              placeholder={s.placeholder}
              aria-invalid={!!errors[s.key]}
              {...form.register(s.key, clearSaved)}
            />
            {errors[s.key] ? (
              <p role="alert" className="text-sm text-destructive">
                {errors[s.key]?.message}
              </p>
            ) : null}
          </FormField>
        ))}
      </div>

      {update.isError ? (
        <p role="alert" className="text-sm text-destructive">
          We could not save the band. Please try again.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={update.isPending || !isDirty}>
          {update.isPending ? "Saving..." : "Save band"}
        </Button>
        <SavedNote show={saved && !isDirty} />
      </div>
    </form>
  );
}

/** Admin-only band name and public profile. Photo is display only for now. */
export function BandSection({ band }: { band: BandSummary }) {
  const detail = useBandDetail(band.id);
  return (
    <SectionCard id="settings-band" title="Band" testId="settings-band">
      <div className="flex items-center gap-4">
        <BandAvatar
          band={{ id: band.id, name: band.name, imageUrl: band.photoUrl }}
          className="size-16 text-xl"
        />
        <span
          data-testid="settings-band-name"
          className="truncate text-lg font-semibold"
        >
          {band.name}
        </span>
      </div>
      {detail.data ? (
        <BandForm detail={detail.data} />
      ) : detail.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Could not load the band profile.
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          Loading...
        </p>
      )}
    </SectionCard>
  );
}
