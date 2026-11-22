---
name: calendar-grid-date-dependence
description: Seeded gig dates are relative to today, so calendar specs must page the month grid instead of assuming two gigs share a grid
type: project
applies-to: apps/e2e/tests/events-*, apps/e2e/tests/gate2-layout.spec.ts, apps/e2e/tests/calendar-*
---
The month grid spans whole Sunday to Saturday weeks and seeded gigs sit at +12 and +20 days from today, so on some dates (Nov 16 to 17, 2026 for example) two gigs share no grid, or a gig sits in two neighbouring grids so an agenda-card tap does not navigate. Specs failed deterministically on those dates (2026-11-16 and 2026-11-17; fixed in #89).
**Why:** CI went red on unchanged code for days and blocked every unit.
**How to apply:** in calendar specs use `pageToDay` and `pageAwayFromDay` from `apps/e2e/tests/events-helpers.ts` instead of fixed Next/Previous clicks; reason about the month-end and Sunday boundaries when adding a spec that depends on two gigs being visible together.
