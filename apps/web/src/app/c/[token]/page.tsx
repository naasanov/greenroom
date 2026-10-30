import type { Metadata } from "next";
import { Suspense } from "react";
import { PublicCalendarView } from "@/components/public-calendar/public-calendar-view";

export const metadata: Metadata = {
  title: "Upcoming shows | Greenroom",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PublicCalendarPage() {
  return (
    <Suspense>
      <PublicCalendarView />
    </Suspense>
  );
}
