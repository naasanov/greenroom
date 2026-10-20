import { TabPlaceholder } from "@/components/onboarding/tab-placeholder";

/** Events tab content. `focusDate` (YYYY-MM-DD) is where the calendar will open. */
export function EventsTab({ focusDate }: { focusDate?: string }) {
  return (
    <div data-testid="events-tab" data-focus-date={focusDate}>
      <TabPlaceholder tab="events" />
    </div>
  );
}
