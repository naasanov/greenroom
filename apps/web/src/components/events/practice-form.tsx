"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  createPracticeSchema,
  localDateSchema,
  localTimeSchema,
  recurrenceSchema,
  updatePracticeSchema,
  weekdaySchema,
  type CreatePractice,
  type EditScope,
  type Recurrence,
  type UpdatePractice,
  type Weekday,
} from "@greenroom/shared";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FieldError,
  FormActions,
  NativeSelect,
} from "@/components/events/form-parts";
import {
  WEEKDAY_INITIAL,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
  nthWeekdayLabel,
  recurrenceSummary,
  weekdayOf,
} from "@/components/events/recurrence";
import { cn } from "@/lib/utils";

const DURATIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300];

function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

const practiceFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give the practice a title."),
    location: z.string().trim().max(500),
    startDate: localDateSchema,
    startTime: localTimeSchema,
    durationMinutes: z.coerce.number().int().min(1).max(1440),
    freq: z.enum(["none", "weekly", "monthly"]),
    interval: z.coerce.number().int().min(1).max(52),
    byWeekday: z.array(weekdaySchema),
    monthlyMode: z.enum(["dayOfMonth", "nthWeekday"]),
    endType: z.enum(["never", "until", "count"]),
    endDate: z.string(),
    endCount: z.coerce.number().int().min(1).max(520),
  })
  .superRefine((v, ctx) => {
    if (v.freq === "weekly" && v.byWeekday.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["byWeekday"],
        message: "Pick at least one day.",
      });
    }
    if (v.freq !== "none" && v.endType === "until") {
      if (!localDateSchema.safeParse(v.endDate).success) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "Pick an end date.",
        });
      } else if (v.endDate < v.startDate) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "End date is before the start.",
        });
      }
    }
  });

// The resolver's input type carries the coerced fields as unknown.
type PracticeFormValues = z.input<typeof practiceFormSchema>;
type PracticeFormOutput = z.output<typeof practiceFormSchema>;

function recurrenceOf(v: PracticeFormOutput): Recurrence {
  if (v.freq === "none") {
    return recurrenceSchema.parse({ freq: "none", end: { type: "never" } });
  }
  const end =
    v.endType === "until"
      ? { type: "until" as const, date: v.endDate }
      : v.endType === "count"
        ? { type: "count" as const, count: v.endCount }
        : { type: "never" as const };
  return recurrenceSchema.parse(
    v.freq === "weekly"
      ? {
          freq: "weekly",
          interval: v.interval,
          byWeekday: WEEKDAY_ORDER.filter((d) => v.byWeekday.includes(d)),
          end,
        }
      : {
          freq: "monthly",
          interval: v.interval,
          monthlyMode: v.monthlyMode,
          end,
        },
  );
}

export interface PracticeInitial {
  title: string;
  location: string | null;
  startDate: string;
  startTime: string;
  durationMinutes: number;
  recurrence?: Recurrence;
}

function defaultsFor(
  initial: PracticeInitial | undefined,
  defaultDate: string,
): PracticeFormValues {
  const startDate = initial?.startDate ?? defaultDate;
  const r = initial?.recurrence;
  return {
    title: initial?.title ?? "",
    location: initial?.location ?? "",
    startDate,
    startTime: initial?.startTime ?? "19:00",
    durationMinutes: initial?.durationMinutes ?? 120,
    freq: r?.freq ?? "none",
    interval: r?.interval ?? 1,
    byWeekday: r?.byWeekday?.length
      ? r.byWeekday
      : startDate
        ? [weekdayOf(startDate)]
        : [],
    monthlyMode: r?.monthlyMode ?? "dayOfMonth",
    endType: r?.end.type ?? "never",
    endDate: r?.end.type === "until" ? r.end.date : "",
    endCount: r?.end.type === "count" ? r.end.count : 10,
  };
}

export type PracticeSubmit =
  | { kind: "create"; body: CreatePractice }
  | { kind: "update"; body: UpdatePractice };

/**
 * Create a practice series, or edit an occurrence with a scope. The scope decides
 * which fields apply: "this" hides recurrence, "this_and_following" locks the date.
 */
export function PracticeForm({
  initial,
  scope,
  defaultDate = "",
  timeZone,
  idPrefix = "practice",
  submitLabel,
  onSubmit,
  onCancel,
  onDirtyChange,
}: {
  initial?: PracticeInitial;
  /** Present when editing an existing occurrence. */
  scope?: EditScope;
  defaultDate?: string;
  timeZone: string;
  idPrefix?: string;
  submitLabel: string;
  onSubmit: (submit: PracticeSubmit) => Promise<unknown>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const form = useForm<PracticeFormValues, unknown, PracticeFormOutput>({
    resolver: zodResolver(practiceFormSchema),
    defaultValues: defaultsFor(initial, defaultDate),
  });
  const { errors, isDirty, isSubmitting } = form.formState;
  const [serverError, setServerError] = useState<string | null>(null);
  const weekdaysTouched = useRef(!!initial);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const id = (name: string) => `${idPrefix}-${name}`;
  const startDate = useWatch({ control: form.control, name: "startDate" });
  const freq = useWatch({ control: form.control, name: "freq" });
  const byWeekday = useWatch({ control: form.control, name: "byWeekday" });
  const endType = useWatch({ control: form.control, name: "endType" });
  const interval =
    Number(useWatch({ control: form.control, name: "interval" })) || 1;
  const monthlyMode = useWatch({ control: form.control, name: "monthlyMode" });
  const endDate = useWatch({ control: form.control, name: "endDate" });
  const endCount =
    Number(useWatch({ control: form.control, name: "endCount" })) || 1;
  const duration = Number(
    useWatch({ control: form.control, name: "durationMinutes" }),
  );

  // Until the user picks days, the weekly default follows the start date.
  useEffect(() => {
    if (
      weekdaysTouched.current ||
      !localDateSchema.safeParse(startDate).success
    ) {
      return;
    }
    form.setValue("byWeekday", [weekdayOf(startDate)], { shouldDirty: false });
  }, [startDate, form]);

  const showRecurrence = scope !== "this";
  const dateLocked = scope === "this_and_following";
  const validDate = localDateSchema.safeParse(startDate).success;

  const durations = useMemo(
    () =>
      DURATIONS.includes(duration) || !duration
        ? DURATIONS
        : [...DURATIONS, duration].sort((a, b) => a - b),
    [duration],
  );

  const summary = validDate
    ? recurrenceSummary(
        {
          freq,
          interval,
          byWeekday,
          monthlyMode,
          end:
            endType === "until"
              ? { type: "until", date: endDate || startDate }
              : endType === "count"
                ? { type: "count", count: endCount }
                : { type: "never" },
        },
        startDate,
      )
    : null;

  function toggleDay(day: Weekday) {
    weekdaysTouched.current = true;
    const next = byWeekday.includes(day)
      ? byWeekday.filter((d) => d !== day)
      : [...byWeekday, day];
    form.setValue("byWeekday", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  async function submit(v: PracticeFormOutput) {
    setServerError(null);
    const base = {
      title: v.title,
      location: v.location === "" ? null : v.location,
      startTime: v.startTime,
      durationMinutes: v.durationMinutes,
    };
    try {
      if (!scope) {
        await onSubmit({
          kind: "create",
          body: createPracticeSchema.parse({
            ...base,
            startDate: v.startDate,
            timeZone,
            recurrence: recurrenceOf(v),
          }),
        });
        return;
      }
      const body: UpdatePractice =
        scope === "this"
          ? { scope, ...base, startDate: v.startDate }
          : scope === "this_and_following"
            ? { scope, ...base, timeZone, recurrence: recurrenceOf(v) }
            : {
                scope,
                ...base,
                startDate: v.startDate,
                timeZone,
                recurrence: recurrenceOf(v),
              };
      await onSubmit({
        kind: "update",
        body: updatePracticeSchema.parse(body),
      });
    } catch (e) {
      setServerError(
        e instanceof Error ? e.message : "Could not save the practice.",
      );
    }
  }

  return (
    <form
      noValidate
      id={id("form")}
      data-testid={id("form")}
      className="flex flex-col gap-4 pt-1"
      onSubmit={form.handleSubmit(submit)}
    >
      <FormField label="Title" htmlFor={id("title")}>
        <Input
          id={id("title")}
          autoComplete="off"
          placeholder="e.g. Weekly practice"
          maxLength={200}
          aria-invalid={!!errors.title}
          {...form.register("title")}
        />
        <FieldError message={errors.title?.message} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label={scope === "this" || !scope ? "Date" : "Start date"}
          htmlFor={id("date")}
        >
          <Input
            id={id("date")}
            type="date"
            disabled={dateLocked}
            aria-invalid={!!errors.startDate}
            {...form.register("startDate")}
          />
          {errors.startDate ? <FieldError message="Pick a date." /> : null}
        </FormField>
        <FormField label="Start time" htmlFor={id("time")}>
          <Input
            id={id("time")}
            type="time"
            aria-invalid={!!errors.startTime}
            {...form.register("startTime")}
          />
          {errors.startTime ? <FieldError message="Pick a time." /> : null}
        </FormField>
      </div>

      <FormField label="Duration" htmlFor={id("duration")}>
        <NativeSelect id={id("duration")} {...form.register("durationMinutes")}>
          {durations.map((d) => (
            <option key={d} value={d}>
              {durationLabel(d)}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      {showRecurrence ? (
        <div className="flex flex-col gap-3">
          <FormField label="Repeat" htmlFor={id("freq")}>
            <NativeSelect id={id("freq")} {...form.register("freq")}>
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </NativeSelect>
          </FormField>

          {freq !== "none" ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span>Every</span>
                <Input
                  aria-label="Repeat interval"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={52}
                  className="w-20"
                  {...form.register("interval")}
                />
                <span>{freq === "weekly" ? "week(s)" : "month(s)"}</span>
              </div>

              {freq === "weekly" ? (
                <div className="flex flex-col gap-1.5">
                  <div
                    role="group"
                    aria-label="Repeat on"
                    className="flex justify-between gap-1"
                  >
                    {WEEKDAY_ORDER.map((d) => {
                      const on = byWeekday.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          aria-label={WEEKDAY_SHORT[d]}
                          onClick={() => toggleDay(d)}
                          className={cn(
                            "flex size-10 items-center justify-center rounded-full border text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                            on
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {WEEKDAY_INITIAL[d]}
                        </button>
                      );
                    })}
                  </div>
                  <FieldError message={errors.byWeekday?.message} />
                </div>
              ) : (
                <NativeSelect
                  aria-label="Monthly repeat"
                  {...form.register("monthlyMode")}
                >
                  <option value="dayOfMonth">
                    {`On day ${validDate ? Number(startDate.slice(8, 10)) : "of the month"}`}
                  </option>
                  <option value="nthWeekday">
                    {validDate
                      ? `On the ${nthWeekdayLabel(startDate)}`
                      : "On the same weekday"}
                  </option>
                </NativeSelect>
              )}

              <div className="flex flex-col gap-2">
                <NativeSelect aria-label="Ends" {...form.register("endType")}>
                  <option value="never">Never ends</option>
                  <option value="until">Ends on a date</option>
                  <option value="count">Ends after a number of times</option>
                </NativeSelect>
                {endType === "until" ? (
                  <>
                    <Input
                      aria-label="End date"
                      type="date"
                      aria-invalid={!!errors.endDate}
                      {...form.register("endDate")}
                    />
                    <FieldError message={errors.endDate?.message} />
                  </>
                ) : null}
                {endType === "count" ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Input
                      aria-label="Number of occurrences"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={520}
                      className="w-24"
                      {...form.register("endCount")}
                    />
                    <span>occurrences</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {summary && freq !== "none" ? (
            <p
              data-testid="recurrence-summary"
              className="rounded-xl bg-practice-soft px-3 py-2 text-sm text-practice-soft-foreground"
            >
              {summary}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Changes apply to this practice only.
        </p>
      )}

      <FormField label="Location" htmlFor={id("location")}>
        <Input
          id={id("location")}
          autoComplete="off"
          placeholder="e.g. Rehearsal room B"
          {...form.register("location")}
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
