"use client";

import { useDeferredValue, useMemo, useState } from "react";
import {
  parsePlainText,
  sheetToPlainText,
  type SongChordSheet,
} from "@greenroom/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSaveChords } from "@/lib/queries/chords";
import { ChordSheetView } from "./chord-sheet-view";

const PLACEHOLDER = `[Verse]
G          D
Words go here under the chords
Em         C
Keep going on the next line

Chorus:
C    G
Sing it loud`;

/** Plain-text chord editor with a live preview; chords sit on the line above the lyrics. */
export function ChordsEditor({
  bandId,
  songId,
  existing,
  onClose,
}: {
  bandId: string;
  songId: string;
  existing: SongChordSheet | null;
  onClose: () => void;
}) {
  const [text, setText] = useState(() =>
    existing ? sheetToPlainText(existing.sheet) : "",
  );
  const save = useSaveChords(bandId, songId);
  const deferred = useDeferredValue(text);
  const preview = useMemo(() => parsePlainText(deferred), [deferred]);
  const empty = text.trim() === "";

  return (
    <div data-testid="chords-editor" className="flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <h3 className="text-sm font-semibold">
          {existing ? "Edit chords" : "Write chords"}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="chords-editor-cancel"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="chords-editor-save"
            disabled={empty || save.isPending}
            onClick={() => save.mutate(text, { onSuccess: onClose })}
          >
            {save.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Put chords on the line above the lyrics. Section names like [Verse] or
          Chorus: go on their own line.
        </p>
        <Textarea
          data-testid="chords-editor-text"
          aria-label="Chords and lyrics"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-h-48 font-mono text-sm whitespace-pre"
        />
        {save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Could not save the chords. Please try again.
          </p>
        ) : null}
        <p className="text-xs font-medium text-muted-foreground">Preview</p>
        <div
          data-testid="chords-editor-preview"
          className="overflow-x-auto rounded-xl border bg-white p-3"
        >
          {empty ? (
            <p className="text-sm text-zinc-500">Nothing to preview yet.</p>
          ) : (
            <ChordSheetView
              sheet={preview}
              semitones={0}
              preferFlats={false}
              fontSize={14}
              lyricsOnly={false}
              theme="light"
              twoColumns={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
