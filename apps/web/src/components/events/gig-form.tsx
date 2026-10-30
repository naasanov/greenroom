"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  createGigSchema,
  localDateSchema,
  localTimeSchema,
  type CreateGig,
  type Gig,
} from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_PLACE,
  PlacePicker,
  type PlaceValue,
} from "@/components/events/place-picker";
import { FormActions, FieldError } from "@/components/events/form-parts";

const optionalTime = z.union([z.literal(""), localTimeSchema]);

const gigFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give the gig a title."),
    date: localDateSchema,
    startTime: optionalTime,
    endTime: optionalTime,
    loadInTime: optionalTime,
    place: z.object({
      venueName: z.string(),
      address: z.string(),
      googlePlaceId: z.string(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
    }),
    contactName: z.string().trim().max(200),
    contactPhone: z.string().trim().max(50),
    contactEmail: z.union([
      z.literal(""),
      z.string().trim().email("Enter a valid email address."),
    ]),
    notes: z.string().trim().max(10000),
  })
  .superRefine((v, ctx) => {
    if (v.endTime && !v.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Add a start time first.",
      });
    } else if (v.endTime && v.startTime && v.endTime < v.startTime) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End time must be after the start time",
      });
    }
  });

type GigFormValues = z.infer<typeof gigFormSchema>;

const orNull = (s: string) => (s.trim() === "" ? null : s.trim());

/** Form values to the API body. A gig with no times at all is an all-day entry. */
function toPayload(v: GigFormValues, timeZone: string): CreateGig {
  const noTimes = !v.startTime && !v.endTime && !v.loadInTime;
  return createGigSchema.parse({
    title: v.title,
    date: v.date,
    allDay: noTimes,
    startTime: orNull(v.startTime),
    endTime: orNull(v.endTime),
    loadInTime: orNull(v.loadInTime),
    timeZone,
    venueName: orNull(v.place.venueName),
    address: orNull(v.place.address),
    googlePlaceId: orNull(v.place.googlePlaceId),
    lat: v.place.lat,
    lng: v.place.lng,
    contactName: orNull(v.contactName),
    contactPhone: orNull(v.contactPhone),
    contactEmail: orNull(v.contactEmail),
    notes: orNull(v.notes),
  });
}

function defaultsFor(gig: Gig | undefined, date: string): GigFormValues {
  return {
    title: gig?.title ?? "",
    date: gig?.date ?? date,
    startTime: gig?.startTime ?? "",
    endTime: gig?.endTime ?? "",
    loadInTime: gig?.loadInTime ?? "",
    place: gig
      ? {
          venueName: gig.venueName ?? "",
          address: gig.address ?? "",
          googlePlaceId: gig.googlePlaceId ?? "",
          lat: gig.lat,
          lng: gig.lng,
        }
      : EMPTY_PLACE,
    contactName: gig?.contactName ?? "",
    contactPhone: gig?.contactPhone ?? "",
    contactEmail: gig?.contactEmail ?? "",
    notes: gig?.notes ?? "",
  };
}

/** Create or edit a gig. Only title and date are required. */
/** WebKit gives native time inputs an intrinsic width; this lets the grid size them. */
const TIME_INPUT =
  "min-w-0 w-full max-w-full appearance-none [&::-webkit-date-and-time-value]:min-w-0 [&::-webkit-date-and-time-value]:text-left";

export function GigForm({
  bandId,
  gig,
  defaultDate = "",
  timeZone,
  idPrefix = "gig",
  submitLabel,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  bandId: string;
  /** Present when editing. */
  gig?: Gig;
  defaultDate?: string;
  timeZone: string;
  idPrefix?: string;
  submitLabel: string;
  onSubmit: (payload: CreateGig) => Promise<unknown>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const form = useForm<GigFormValues>({
    resolver: zodResolver(gigFormSchema),
    defaultValues: defaultsFor(gig, defaultDate),
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const id = (name: string) => `${idPrefix}-${name}`;
  const place: PlaceValue = useWatch({ control: form.control, name: "place" });

  return (
    <form
      noValidate
      id={id("form")}
      data-testid={id("form")}
      className="flex flex-col gap-4 pt-1"
      onSubmit={form.handleSubmit(async (v) => {
        setServerError(null);
        try {
          await onSubmit(toPayload(v, timeZone));
        } catch (e) {
          setServerError(
            e instanceof Error ? e.message : "Could not save the gig.",
          );
        }
      })}
    >
      <FormField label="Title" htmlFor={id("title")}>
        <Input
          id={id("title")}
          autoComplete="off"
          placeholder="e.g. Club Meridian"
          maxLength={200}
          aria-invalid={!!errors.title}
          {...form.register("title")}
        />
        <FieldError message={errors.title?.message} />
      </FormField>

      <FormField label="Date" htmlFor={id("date")}>
        <Input
          id={id("date")}
          type="date"
          aria-invalid={!!errors.date}
          {...form.register("date")}
        />
        {errors.date ? <FieldError message="Pick a date." /> : null}
      </FormField>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 [&>*]:min-w-0">
        <FormField label="Start time" htmlFor={id("start")}>
          <Input
            id={id("start")}
            type="time"
            className={TIME_INPUT}
            aria-invalid={!!errors.startTime}
            {...form.register("startTime")}
          />
        </FormField>
        <FormField label="End time" htmlFor={id("end")}>
          <Input
            id={id("end")}
            type="time"
            className={TIME_INPUT}
            aria-invalid={!!errors.endTime}
            {...form.register("endTime")}
          />
          <FieldError message={errors.endTime?.message} />
        </FormField>
        <FormField
          label="Load-in time"
          htmlFor={id("loadin")}
          className="col-span-2 sm:col-span-1"
        >
          <Input
            id={id("loadin")}
            type="time"
            className={TIME_INPUT}
            {...form.register("loadInTime")}
          />
        </FormField>
      </div>

      <FormField label="Venue" htmlFor={id("venue")}>
        <PlacePicker
          id={id("venue")}
          bandId={bandId}
          value={place}
          onChange={(p) => form.setValue("place", p, { shouldDirty: true })}
        />
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium">Point of contact</legend>
        <Input
          aria-label="Contact name"
          placeholder="Name (booker, sound person...)"
          autoComplete="off"
          {...form.register("contactName")}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            aria-label="Contact phone"
            type="tel"
            placeholder="Phone"
            autoComplete="off"
            {...form.register("contactPhone")}
          />
          <div className="flex flex-col gap-1.5">
            <Input
              aria-label="Contact email"
              type="email"
              placeholder="Email"
              autoComplete="off"
              aria-invalid={!!errors.contactEmail}
              {...form.register("contactEmail")}
            />
            <FieldError message={errors.contactEmail?.message} />
          </div>
        </div>
      </fieldset>

      <FormField label="Notes" htmlFor={id("notes")}>
        <Textarea
          id={id("notes")}
          rows={3}
          placeholder="Parking, pay, dress code..."
          {...form.register("notes")}
        />
      </FormField>

      <FormActions error={serverError}>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          className="flex-1"
          disabled={isSubmitting}
          data-testid={id("submit")}
        >
          {isSubmitting ? "Saving..." : submitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
