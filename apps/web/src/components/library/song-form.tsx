"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Music2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { FormField } from "@/components/app/form-field";
import { LinkList } from "@/components/app/link-list";
import { Thumbnail } from "@/components/app/list-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSuggestTab } from "@/lib/queries/songs";
import { useDebounced } from "./use-debounced";
import { parseDuration, type SongFormValues } from "./song-utils";

const formSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(300),
  artist: z.string().max(300),
  duration: z
    .string()
    .refine((v) => parseDuration(v) !== undefined, "Use m:ss, like 3:45"),
  notes: z.string().max(10_000),
  references: z.array(
    z.object({ id: z.string(), label: z.string(), value: z.string() }),
  ),
});

/**
 * Title, artist, duration, reference rows and notes. Shared by the add sheet
 * and in-place editing; the caller owns saving.
 */
export function SongForm({
  formId,
  bandId,
  defaults,
  art,
  suggestTab,
  notice,
  onSubmit,
  onDirtyChange,
  onDismissTab,
  children,
}: {
  formId: string;
  bandId: string;
  defaults: SongFormValues;
  art?: string | null;
  /** Looks for a Songsterr tab as the title/artist settle. */
  suggestTab: boolean;
  notice?: ReactNode;
  onSubmit: (values: SongFormValues) => void;
  onDirtyChange: (dirty: boolean) => void;
  onDismissTab?: (url: string) => void;
  children?: ReactNode;
}) {
  const form = useForm<SongFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults,
  });
  const { errors, isDirty } = form.formState;
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const [rawTitle, rawArtist, references] = useWatch({
    control: form.control,
    name: ["title", "artist", "references"],
  });
  const title = useDebounced(rawTitle.trim(), 500);
  const artist = useDebounced(rawArtist.trim(), 500);
  const tab = useSuggestTab(bandId, title, artist, suggestTab);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const suggestion = tab.data;
  const showTab =
    !!suggestion &&
    dismissed !== suggestion.value &&
    !references.some(
      (r) =>
        r.value.trim() === suggestion.value ||
        r.label.trim().toLowerCase() === "songsterr",
    );

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-5"
      onSubmit={form.handleSubmit(onSubmit)}
    >
      {notice}
      <div className="flex items-start gap-3">
        <Thumbnail
          src={art}
          seed={rawTitle || "song"}
          className="size-16"
          icon={<Music2 className="size-7 opacity-70" />}
        />
        <FormField label="Title" htmlFor={`${formId}-title`} className="flex-1">
          <Input
            id={`${formId}-title`}
            autoComplete="off"
            aria-invalid={!!errors.title}
            {...form.register("title")}
          />
          {errors.title ? (
            <p role="alert" className="text-sm text-destructive">
              {errors.title.message}
            </p>
          ) : null}
        </FormField>
      </div>
      <FormField label="Artist" htmlFor={`${formId}-artist`}>
        <Input
          id={`${formId}-artist`}
          autoComplete="off"
          {...form.register("artist")}
        />
      </FormField>
      <FormField label="Duration" htmlFor={`${formId}-duration`}>
        <Input
          id={`${formId}-duration`}
          placeholder="3:45"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={!!errors.duration}
          {...form.register("duration")}
        />
        {errors.duration ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.duration.message}
          </p>
        ) : null}
      </FormField>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Reference</span>
        <LinkList
          editing
          rows={references}
          onChange={(rows) =>
            form.setValue("references", rows, { shouldDirty: true })
          }
        />
        {showTab ? (
          <div
            data-testid="songsterr-suggestion"
            className="flex items-center gap-2 rounded-2xl bg-gig-soft px-3 py-2 text-sm text-gig-soft-foreground"
          >
            <span className="flex-1">Found a tab on Songsterr. Add it?</span>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                form.setValue(
                  "references",
                  [
                    ...references,
                    {
                      id: `row-${crypto.randomUUID()}`,
                      label: "Songsterr",
                      value: suggestion.value,
                    },
                  ],
                  { shouldDirty: true },
                )
              }
            >
              Add tab
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Dismiss suggestion"
              onClick={() => {
                setDismissed(suggestion.value);
                onDismissTab?.(suggestion.value);
              }}
            >
              <X />
            </Button>
          </div>
        ) : null}
      </div>
      <FormField label="Notes" htmlFor={`${formId}-notes`}>
        <Textarea
          id={`${formId}-notes`}
          placeholder="Capo on 2, count in 4 bars..."
          {...form.register("notes")}
        />
      </FormField>
      {children}
    </form>
  );
}
