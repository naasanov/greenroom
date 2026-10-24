-- Series rrules must start with `RRULE:`; backfill rows seeded without it.
UPDATE "practice_series" SET "rrule" = 'RRULE:' || "rrule"
WHERE "rrule" <> '' AND "rrule" NOT LIKE 'RRULE:%';
