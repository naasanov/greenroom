"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  myInstrumentsSchema,
  type PresetInstrumentKey,
} from "@greenroom/shared";
import { InstrumentPicker } from "@/components/app/instrument-picker";
import { findInstrument } from "@/components/app/instruments";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { keys } from "@/lib/queries";

const DEBOUNCE_MS = 600;

type Status = "idle" | "saving" | "saved" | "error";

/**
 * Instrument picker that saves itself: changes show immediately, are debounced,
 * and are sent one request at a time so the last selection always wins.
 */
export function InstrumentsAutosave({ initial }: { initial: string[] }) {
  const qc = useQueryClient();
  const [instruments, setInstruments] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const latest = useRef(initial);
  const lastSent = useRef(initial.join("\n"));
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  const flush = useCallback(async () => {
    if (inFlight.current) return;
    const sending = latest.current;
    inFlight.current = true;
    setStatus("saving");
    try {
      const saved = await api("/me/instruments", {
        method: "PUT",
        body: {
          presets: sending.filter((i) =>
            findInstrument(i),
          ) as PresetInstrumentKey[],
          custom: sending.filter((i) => !findInstrument(i)),
        },
        schema: myInstrumentsSchema,
      });
      qc.setQueryData(keys.instruments, saved);
      lastSent.current = sending.join("\n");
      void qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "bands" && q.queryKey[2] === "members",
      });
      inFlight.current = false;
      if (latest.current.join("\n") !== lastSent.current)
        void flushRef.current();
      else setStatus("saved");
    } catch {
      inFlight.current = false;
      setStatus("error");
    }
  }, [qc]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(
    () => () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      void flushRef.current();
    },
    [],
  );

  function change(next: string[]) {
    setInstruments(next);
    latest.current = next;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, DEBOUNCE_MS);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">What do you play?</p>
        <span role="status" className="text-sm text-muted-foreground">
          {status === "saving"
            ? "Saving..."
            : status === "saved"
              ? "Saved"
              : ""}
        </span>
      </div>
      <InstrumentPicker value={instruments} onChange={change} />
      {status === "error" ? (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <span className="text-destructive">
            We could not save your instruments.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void flush()}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
