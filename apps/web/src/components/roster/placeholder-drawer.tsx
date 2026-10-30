"use client";

import { useState } from "react";
import {
  type BandMember,
  type CreatePlaceholder,
  type PresetInstrumentKey,
} from "@greenroom/shared";
import { BottomDrawer } from "@/components/app/bottom-drawer";
import { FormField } from "@/components/app/form-field";
import { InstrumentPicker } from "@/components/app/instrument-picker";
import { findInstrument } from "@/components/app/instruments";
import { memberInstruments } from "@/components/roster/member-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePlaceholder, useUpdatePlaceholder } from "@/lib/queries";

function Form({
  bandId,
  member,
  onDone,
}: {
  bandId: string;
  member: BandMember | null;
  onDone: () => void;
}) {
  const create = useCreatePlaceholder(bandId);
  const update = useUpdatePlaceholder(bandId);
  const [name, setName] = useState(member?.displayName ?? "");
  const [instruments, setInstruments] = useState<string[]>(
    member ? memberInstruments(member) : [],
  );
  const [email, setEmail] = useState(member?.email ?? "");
  const [notes, setNotes] = useState(member?.notes ?? "");
  const [invalid, setInvalid] = useState(false);
  const pending = create.isPending || update.isPending;
  const failed = create.isError || update.isError;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const body: CreatePlaceholder = {
      displayName: name.trim(),
      instruments: {
        presets: instruments.filter((i) =>
          findInstrument(i),
        ) as PresetInstrumentKey[],
        custom: instruments.filter((i) => !findInstrument(i)),
      },
      email: email.trim() || null,
      notes: notes.trim() || null,
    };
    if (member) {
      update.mutate(
        { userId: member.userId, patch: body },
        { onSuccess: onDone },
      );
    } else {
      create.mutate(body, { onSuccess: onDone });
    }
  }

  return (
    <form noValidate className="flex flex-col gap-5 pt-2" onSubmit={submit}>
      <FormField label="Name" htmlFor="placeholder-name">
        <Input
          id="placeholder-name"
          value={name}
          aria-invalid={invalid}
          onChange={(e) => setName(e.target.value)}
        />
        {invalid ? (
          <p role="alert" className="text-sm text-destructive">
            Enter a name.
          </p>
        ) : null}
      </FormField>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Instruments</p>
        <InstrumentPicker value={instruments} onChange={setInstruments} />
      </div>
      <FormField
        label="Email (optional)"
        htmlFor="placeholder-email"
        hint="For your reference only. They are never emailed."
      >
        <Input
          id="placeholder-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </FormField>
      <FormField label="Notes (optional)" htmlFor="placeholder-notes">
        <Textarea
          id="placeholder-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          That did not work. Check the details and try again.
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving..." : member ? "Save" : "Add to roster"}
      </Button>
    </form>
  );
}

/** Add or edit a roster-only member who has no Greenroom account. */
export function PlaceholderDrawer({
  bandId,
  member,
  open,
  onOpenChange,
  nested,
}: {
  bandId: string;
  member: BandMember | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nested?: boolean;
}) {
  return (
    <BottomDrawer
      open={open}
      onOpenChange={onOpenChange}
      nested={nested}
      title={member ? "Edit member" : "Add member"}
      description={
        member
          ? undefined
          : "For someone who will not sign up. They can claim this spot later if they join."
      }
    >
      {open ? (
        <Form
          key={member?.userId ?? "new"}
          bandId={bandId}
          member={member}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </BottomDrawer>
  );
}
