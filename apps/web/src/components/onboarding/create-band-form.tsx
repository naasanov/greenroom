"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { createBandSchema, type BandSummary } from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateBand } from "@/lib/queries";

/** Band name field + submit; reports the created band to the caller. */
export function CreateBandForm({
  onCreated,
  submitLabel = "Create band",
  idPrefix = "create-band",
}: {
  onCreated: (band: BandSummary) => void;
  submitLabel?: string;
  idPrefix?: string;
}) {
  const create = useCreateBand();
  const form = useForm({
    resolver: zodResolver(createBandSchema),
    defaultValues: { name: "" },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={form.handleSubmit((v) =>
        create.mutate(v, { onSuccess: onCreated }),
      )}
    >
      <FormField label="Band name" htmlFor={`${idPrefix}-name`}>
        <Input
          id={`${idPrefix}-name`}
          placeholder="e.g. The Night Owls"
          autoComplete="off"
          maxLength={100}
          aria-invalid={!!form.formState.errors.name}
          {...form.register("name")}
        />
        {form.formState.errors.name ? (
          <p role="alert" className="text-sm text-destructive">
            Give your band a name.
          </p>
        ) : null}
      </FormField>
      {create.isError ? (
        <p role="alert" className="text-sm text-destructive">
          We could not create the band. Please try again.
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={create.isPending}>
        {create.isPending ? "Creating..." : submitLabel}
      </Button>
    </form>
  );
}
