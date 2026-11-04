"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type NameDialogState =
  { kind: "create" } | { kind: "rename"; fileId: string; name: string };

/** Name prompt shared by New folder and Rename. */
export function NameDialog({
  state,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  state: NameDialogState | null;
  pending?: boolean;
  error?: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(state);
  if (state && state !== shown) setShown(state);
  const [value, setValue] = useState("");
  const [prev, setPrev] = useState<NameDialogState | null>(null);
  if (state !== prev) {
    setPrev(state);
    if (state) setValue(state.kind === "rename" ? state.name : "");
  }
  const rename = shown?.kind === "rename";
  const trimmed = value.trim();
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && !pending) onSubmit(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {rename ? "Rename" : "New folder"}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            aria-label="Name"
            placeholder={rename ? "Name" : "Folder name"}
            maxLength={200}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed || pending}>
              {rename ? "Rename" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
