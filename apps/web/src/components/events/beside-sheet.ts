const BASE =
  "transition-[right] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none md:data-[vaul-drawer-direction=bottom]:left-auto!";
const CLEAR_FABS = "md:data-[vaul-drawer-direction=bottom]:right-[5.5rem]!";
const CLEAR_SHEET =
  "md:data-[vaul-drawer-direction=bottom]:right-[26.75rem]! md:max-w-[min(32rem,calc(100vw-27.75rem))]";

/**
 * Event drawer placement on md+ screens: anchored right, ending left of the
 * FAB column, or left of the 26rem agenda sheet when `beside` is true.
 * Phones keep the full-width bottom drawer.
 */
export function eventDrawerClass(beside: boolean): string {
  return `${BASE} ${beside ? CLEAR_SHEET : CLEAR_FABS}`;
}
