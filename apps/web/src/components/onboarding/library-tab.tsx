import { TabPlaceholder } from "@/components/onboarding/tab-placeholder";

/** Music Library tab content. */
export function LibraryTab() {
  return (
    <div data-testid="library-tab">
      <TabPlaceholder tab="library" />
    </div>
  );
}
