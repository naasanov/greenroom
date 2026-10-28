const BASE =
  "transition-[right] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:data-[vaul-drawer-direction=bottom]:left-auto! md:data-[vaul-drawer-direction=bottom]:max-h-[min(90dvh,calc(100dvh-var(--events-drawer-top,8rem)))]";
const CLEAR_FABS = "md:data-[vaul-drawer-direction=bottom]:right-[5.5rem]!";
const CLEAR_SHEET =
  "md:data-[vaul-drawer-direction=bottom]:right-[31.5rem]! md:max-w-[min(32rem,calc(100vw-32.5rem))]";

/**
 * Event drawer placement on md+: right-anchored, left of the FAB column or the
 * agenda sheet and its FAB column (`beside`), height-capped to stay below the calendar header.
 */
export function eventDrawerClass(beside: boolean): string {
  return `${BASE} ${beside ? CLEAR_SHEET : CLEAR_FABS}`;
}
