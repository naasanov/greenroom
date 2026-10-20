"use client";

import { useState, type ReactNode } from "react";
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
  // Every dismissal route funnels here so guarded drawers stay open.
  const requestClose = () =>
    dismissible ? setOpen(false) : onDismissAttempt?.();
  return (
    <Root open={isOpen} onOpenChange={setOpen} dismissible={dismissible}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent
        onPointerDownOutside={dismissible ? requestClose : undefined}
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
          <DrawerHeader className="relative px-5 pt-3 pb-2 text-left">
            <DrawerTitle
              className={cn(
                "text-lg font-semibold",
                headerAction ? "pr-24" : "pr-12",
              )}
            >
              {title}
            </DrawerTitle>
            {description ? (
              <DrawerDescription>{description}</DrawerDescription>
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
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6",
            !footer && "pb-safe",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <div className="pb-safe border-t bg-popover px-5 pt-3 pb-4">
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
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerAction?: ReactNode;
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pb-safe">
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
        "absolute inset-y-0 right-[calc(100%+0.75rem)] left-auto z-20 flex w-80 flex-col overflow-hidden rounded-3xl border bg-popover shadow-lift transition-[transform,opacity,visibility] duration-300 ease-out motion-reduce:transition-none",
        open
          ? "visible translate-x-0 opacity-100"
          : "invisible translate-x-6 opacity-0",
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
