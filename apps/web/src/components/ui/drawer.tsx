"use client";

import * as React from "react";
import { cn } from "cn";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  useKeyboardViewport,
  useRevealFocusedField,
} from "@/lib/use-visual-viewport";

/**
 * Drawers are non-modal: no backdrop, no body scroll lock, and the page behind
 * stays interactive. Vaul's input repositioning is off; DrawerContent fits the
 * visual viewport itself.
 */
function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      modal={false}
      noBodyStyles
      repositionInputs={false}
      {...props}
    />
  );
}

/**
 * A drawer opened from inside another drawer's content. Uses a plain Root:
 * Vaul's NestedRoot scales the parent from open callbacks that controlled
 * drawers never fire, which makes the parent jump when the child is dragged.
 */
function NestedDrawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <Drawer {...props} />;
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-50", className)}
      {...props}
    />
  );
}

// Layers opened from inside a drawer; clicks in them are not "outside".
const INSIDE_LAYERS =
  '[role="menu"], [role="listbox"], [role="alertdialog"], [data-radix-popper-content-wrapper], [role="dialog"]:not([data-vaul-drawer])';

/**
 * Swallows clicks outside `el` and reports them instead, so a guarded drawer
 * can ask before closing. Drawers stacked above `el` count as inside.
 */
function useOutsideClickGuard(el: HTMLElement | null, guard?: () => void) {
  const guardRef = React.useRef(guard);
  React.useEffect(() => {
    guardRef.current = guard;
  });
  const active = !!guard;
  React.useEffect(() => {
    if (!el || !active) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || el.contains(target) || target.closest(INSIDE_LAYERS)) {
        return;
      }
      const drawer = target.closest("[data-vaul-drawer]");
      if (
        drawer &&
        el.compareDocumentPosition(drawer) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        return;
      }
      if (document.querySelector('[role="alertdialog"]')) return;
      e.preventDefault();
      e.stopPropagation();
      guardRef.current?.();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [el, active]);
}

function DrawerContent({
  className,
  children,
  style,
  onOutsideClickGuard,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  /** Set to swallow outside clicks and call this instead of letting them through. */
  onOutsideClickGuard?: () => void;
}) {
  const [el, setEl] = React.useState<HTMLDivElement | null>(null);
  const keyboard = useKeyboardViewport();
  useRevealFocusedField(el, keyboard);
  useOutsideClickGuard(el, onOutsideClickGuard);
  // Vaul mounts a modal Radix dialog even with modal={false}. Undo its body
  // pointer lock and aria-hidden on the page so the page stays interactive.
  // A real alert dialog may hide the page while open; once it closes, the
  // aria-hidden it leaves behind is cleared too.
  React.useEffect(() => {
    if (!el) return;
    const unhide = () => {
      if (document.querySelector('[role="alertdialog"]')) return;
      document.body.style.pointerEvents = "auto";
      document.querySelectorAll("[data-aria-hidden]").forEach((node) => {
        node.removeAttribute("aria-hidden");
        node.removeAttribute("data-aria-hidden");
      });
      // The alert dialog's cleanup can leave aria-hidden without its marker on
      // live page content; hidden containers that hold controls are never intended.
      document
        .querySelectorAll(
          '[aria-hidden="true"]:not([inert]):has(a[href], button, input, select, textarea)',
        )
        .forEach((node) => {
          if (!node.closest("[inert]")) node.removeAttribute("aria-hidden");
        });
    };
    let frame = requestAnimationFrame(unhide);
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(unhide);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-hidden", "data-aria-hidden"],
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [el]);
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerPrimitive.Content
        ref={setEl}
        data-slot="drawer-content"
        data-keyboard={keyboard.open ? "open" : undefined}
        // With the keyboard up, sit on its top edge and cap to the space above.
        style={
          keyboard.open
            ? {
                bottom: keyboard.bottom,
                maxHeight: keyboard.height - 12,
                ...style,
              }
            : style
        }
        className={cn(
          "group/drawer-content pointer-events-auto! fixed z-50 flex h-auto flex-col bg-popover text-sm text-popover-foreground data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
          className,
        )}
        {...props}
      >
        <div
          data-slot="drawer-handle"
          className="mx-auto mt-3 hidden h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30 group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
        />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-0.5 md:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  NestedDrawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
