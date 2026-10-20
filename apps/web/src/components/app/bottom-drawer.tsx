"use client";

import type { ReactNode } from "react";
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
import { cn } from "@/lib/utils";

export interface BottomDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  /** Keeps the title for screen readers but hides the visible header. */
  hideHeader?: boolean;
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
  /** Ask before dismissing by swipe or backdrop tap. */
  dismissible?: boolean;
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
  trigger,
  footer,
  aside,
  nested,
  tall,
  dismissible = true,
  className,
  bodyClassName,
  children,
}: BottomDrawerProps) {
  const Root = nested ? NestedDrawer : Drawer;
  return (
    <Root open={open} onOpenChange={onOpenChange} dismissible={dismissible}>
      {trigger ? <DrawerTrigger asChild>{trigger}</DrawerTrigger> : null}
      <DrawerContent
        className={cn(
          "mx-auto w-full max-w-lg data-[vaul-drawer-direction=bottom]:mt-12 data-[vaul-drawer-direction=bottom]:max-h-[90dvh] data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:shadow-lift",
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
            <DrawerTitle className="pr-12 text-lg font-semibold">
              {title}
            </DrawerTitle>
            {description ? (
              <DrawerDescription>{description}</DrawerDescription>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              className="absolute top-1 right-3 text-muted-foreground"
              onClick={() => onOpenChange?.(false)}
            >
              <X />
            </Button>
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
 * drawer on desktop and slides up over it on narrow screens.
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
  return (
    <aside
      aria-label={title}
      aria-hidden={!open}
      inert={!open}
      data-state={open ? "open" : "closed"}
      data-vaul-no-drag
      className={cn(
        "absolute z-20 flex flex-col overflow-hidden bg-popover transition-[transform,opacity,visibility] duration-300 ease-out",
        // Narrow: covers the main drawer and slides up from the bottom.
        "inset-0 rounded-t-3xl",
        open ? "visible translate-y-0" : "invisible translate-y-full",
        // Desktop: a thin panel to the left of the main drawer.
        "md:inset-y-0 md:right-[calc(100%+0.75rem)] md:left-auto md:w-80 md:rounded-3xl md:border md:shadow-lift md:translate-y-0",
        open
          ? "md:translate-x-0 md:opacity-100"
          : "md:translate-x-6 md:opacity-0",
        className,
      )}
    >
      <div className="flex items-center gap-2 px-5 pt-4 pb-2">
        <h3 className="flex-1 truncate text-base font-semibold">{title}</h3>
        {headerAction}
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        {children}
      </div>
    </aside>
  );
}
