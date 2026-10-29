"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  NestedDrawer,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export interface BottomDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  /** Keeps the title for screen readers but hides the visible header. */
  hideHeader?: boolean;
  /** Icon button(s) shown in the header beside the close button. */
  headerAction?: ReactNode;
  /** Icon button(s) pinned to the header's left edge, mirroring headerAction. */
  headerLeading?: ReactNode;
  /** Optional trigger element for uncontrolled use. */
  trigger?: ReactNode;
  /** Pinned below the scrolling body, above the safe area. */
  footer?: ReactNode;
  /** Rendered beside or over the drawer, e.g. a SideDrawer. */
  aside?: ReactNode;
  /** Opens as a second drawer stacked over a parent drawer. */
  nested?: boolean;
  /** Fixed tall height instead of fitting the content. */
  tall?: boolean;
  /**
   * When false the drawer is guarded: outside taps, Escape, the close button
   * and swipes call onDismissAttempt instead of closing, and the tap does not
   * reach what was tapped.
   */
  dismissible?: boolean;
  /** Called for a dismissal blocked by `dismissible={false}`. */
  onDismissAttempt?: () => void;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/** Vaul bottom drawer with a drag handle, centered on wide screens. */
export function BottomDrawer({
  open,
  onOpenChange,
  title,
  description,
  hideHeader,
  headerAction,
  headerLeading,
  trigger,
  footer,
  aside,
  nested,
  tall,
  dismissible = true,
  onDismissAttempt,
  className,
  bodyClassName,
  children,
}: BottomDrawerProps) {
  const Root = nested ? NestedDrawer : Drawer;
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (next: boolean) => {
    setInnerOpen(next);
    onOpenChange?.(next);
  };
  // A drawer reopened mid-exit still holds its outside-press listener, so the
  // press that opened it lands as "outside". Presses that began before the
  // drawer opened are ignored.
  const openedAt = useRef(0);
  useEffect(() => {
    if (isOpen) openedAt.current = performance.now();
  }, [isOpen]);
  // Every dismissal route funnels here so guarded drawers stay open.
  const requestClose = () =>
    dismissible ? setOpen(false) : onDismissAttempt?.();
  return (
    <Root open={isOpen} onOpenChange={setOpen} dismissible={dismissible}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent
        data-exiting={open === false ? "" : undefined}
        onPointerDownOutside={
          dismissible
            ? (e) => {
                if (e.detail.originalEvent.timeStamp >= openedAt.current)
                  requestClose();
              }
            : undefined
        }
        onOutsideClickGuard={dismissible ? undefined : onDismissAttempt}
        onEscapeKeyDown={(e) => {
          if (!dismissible) {
            e.preventDefault();
            onDismissAttempt?.();
          }
        }}
        className={cn(
          "mx-auto w-full max-w-lg data-[vaul-drawer-direction=bottom]:mt-12 data-[vaul-drawer-direction=bottom]:max-h-[90dvh] data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:shadow-lift",
          nested &&
            "data-[vaul-drawer-direction=bottom]:max-h-[calc(90dvh-3rem)] data-[vaul-drawer-direction=bottom]:shadow-[0_-10px_36px_-6px_rgb(0_0_0/0.28)]",
          tall && "h-[min(42rem,90dvh)]",
          className,
        )}
      >
        {hideHeader ? (
          <>
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            {description ? (
              <DrawerDescription className="sr-only">
                {description}
              </DrawerDescription>
            ) : null}
          </>
        ) : (
          <DrawerHeader
            className={cn(
              "relative pt-3 pb-2 text-center md:text-center",
              headerAction || headerLeading ? "px-24" : "px-12",
            )}
          >
            <DrawerTitle className="text-lg font-semibold">{title}</DrawerTitle>
            {description ? (
              <DrawerDescription>{description}</DrawerDescription>
            ) : null}
            {headerLeading ? (
              <div className="absolute top-1 left-3 flex items-center">
                {headerLeading}
              </div>
            ) : null}
            <div className="absolute top-1 right-3 flex items-center">
              {headerAction}
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close"
                className="text-muted-foreground"
                onClick={requestClose}
              >
                <X />
              </Button>
            </div>
          </DrawerHeader>
        )}
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5",
            footer ? "pb-6" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="border-t bg-popover px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        ) : null}
        {aside}
      </DrawerContent>
    </Root>
  );
}

/**
 * Thin secondary drawer rendered inside a BottomDrawer. Sits beside the main
 * drawer on desktop; on narrow screens it is its own shorter drawer stacked on
 * top, leaving the main drawer's top edge visible above it.
 */
export function SideDrawer({
  open,
  onOpenChange,
  title,
  headerAction,
  rise,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerAction?: ReactNode;
  /**
   * On wide screens, enter and exit by sliding up from the bottom edge with
   * BottomDrawer's motion, instead of fading in from the side.
   */
  rise?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const wide = useMediaQuery("(min-width: 768px)");

  if (!wide) {
    return (
      <NestedDrawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          onPointerDownOutside={() => onOpenChange(false)}
          className={cn(
            "mx-auto w-[calc(100%-1rem)] max-w-md data-[vaul-drawer-direction=bottom]:mt-12 data-[vaul-drawer-direction=bottom]:h-[min(36rem,calc(90dvh-4rem))] data-[vaul-drawer-direction=bottom]:max-h-[calc(90dvh-4rem)] data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:shadow-[0_-10px_36px_-6px_rgb(0_0_0/0.28)]",
            className,
          )}
        >
          <SideDrawerHeader
            title={title}
            headerAction={headerAction}
            onDone={() => onOpenChange(false)}
            heading={
              <DrawerTitle className="flex-1 truncate text-base font-semibold">
                {title}
              </DrawerTitle>
            }
          />
          <DrawerDescription className="sr-only">{title}</DrawerDescription>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </DrawerContent>
      </NestedDrawer>
    );
  }

  return (
    <aside
      aria-label={title}
      aria-hidden={!open}
      inert={!open}
      data-state={open ? "open" : "closed"}
      data-vaul-no-drag
      className={cn(
        "absolute inset-y-0 right-[calc(100%+0.75rem)] left-auto z-20 flex w-80 flex-col overflow-hidden bg-popover shadow-lift motion-reduce:transition-none",
        rise
          ? "rounded-t-3xl border border-b-0 transition-[transform,visibility] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
          : "rounded-3xl border transition-[transform,opacity,visibility] duration-300 ease-out",
        open
          ? cn("visible", rise ? "translate-y-0" : "translate-x-0 opacity-100")
          : cn(
              "invisible",
              rise ? "translate-y-full" : "translate-x-6 opacity-0",
            ),
        className,
      )}
    >
      <SideDrawerHeader
        title={title}
        headerAction={headerAction}
        onDone={() => onOpenChange(false)}
        heading={
          <h3 className="flex-1 truncate text-base font-semibold">{title}</h3>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        {children}
      </div>
    </aside>
  );
}

function SideDrawerHeader({
  heading,
  headerAction,
  onDone,
}: {
  title: string;
  heading: ReactNode;
  headerAction?: ReactNode;
  onDone: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-5 pt-3 pb-2">
      {heading}
      {headerAction}
      <Button variant="ghost" size="sm" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
