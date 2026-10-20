"use client";

import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface DialogBase {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Generic confirm; `destructive` styles the confirm button as dangerous. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
}: DialogBase & {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-semibold">
            {title}
          </AlertDialogTitle>
          {description ? (
            <AlertDialogDescription className="text-sm">
              {description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "danger" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Shown when closing a form the user has typed into. */
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: DialogBase & { onDiscard: () => void }) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Discard changes?"
      description="What you entered so far will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      destructive
      onConfirm={onDiscard}
    />
  );
}

export type EditScope = "this" | "following" | "all";

const SCOPES: { value: EditScope; label: string }[] = [
  { value: "this", label: "This event" },
  { value: "following", label: "This and following events" },
  { value: "all", label: "All events" },
];

/** Google Calendar style scope picker for recurring events. */
export function EditScopeDialog({
  open,
  onOpenChange,
  onConfirm,
  action = "edit",
}: DialogBase & {
  onConfirm: (scope: EditScope) => void;
  action?: "edit" | "cancel";
}) {
  const [scope, setScope] = useState<EditScope>("this");
  const verb = action === "edit" ? "Edit" : "Cancel";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {verb} recurring event
          </DialogTitle>
          <DialogDescription>
            Choose which events this change applies to.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={scope}
          onValueChange={(v) => setScope(v as EditScope)}
          className="gap-1"
        >
          {SCOPES.map((s) => (
            <Label
              key={s.value}
              htmlFor={`scope-${s.value}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm font-medium hover:bg-muted"
            >
              <RadioGroupItem value={s.value} id={`scope-${s.value}`} />
              {s.label}
            </Label>
          ))}
        </RadioGroup>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            onClick={() => {
              onConfirm(scope);
              onOpenChange(false);
            }}
          >
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
