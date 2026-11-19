"use client";

import {
  AlignLeft,
  ArrowLeft,
  Minus,
  Moon,
  Pause,
  Play,
  Plus,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
} from "react";
import {
  prefersFlats,
  sheetSections,
  transposeKey,
  type SongChordSheet,
} from "@greenroom/shared";
import { cn } from "cn";
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
import { useWakeLock } from "@/components/media/upload/use-wake-lock";
import { useSetBandTranspose } from "@/lib/queries/chords";
import { ChordSheetView } from "./chord-sheet-view";
import { useAutoScroll } from "./use-auto-scroll";
import { foldSemitones, useReaderPrefs } from "./use-reader-prefs";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const MAX_CAPO = 11;

export interface ChordsReaderProps {
  bandId: string;
  songId: string;
  title: string;
  artist: string | null;
  durationSeconds: number | null;
  sheet: SongChordSheet;
  variant: "page" | "embedded";
  onClose?: () => void;
}

function nearestScroller(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight)
      return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

function Btn({
  theme,
  active,
  className,
  children,
  ...props
}: {
  theme: "dark" | "light";
  active?: boolean;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-400 active:opacity-70 disabled:opacity-40",
        theme === "dark"
          ? "bg-white/10 text-white hover:bg-white/20"
          : "bg-zinc-900/10 text-zinc-900 hover:bg-zinc-900/20",
        active && (theme === "dark" ? "bg-white/30" : "bg-zinc-900/30"),
        className,
      )}
    >
      {children}
    </button>
  );
}

function Sep({ theme }: { theme: "dark" | "light" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mx-0.5 h-6 w-px shrink-0",
        theme === "dark" ? "bg-white/20" : "bg-zinc-900/20",
      )}
    />
  );
}

/** Phone-first chord reader: zoom, two-layer transpose, capo, auto-scroll, themes. */
export function ChordsReader({
  bandId,
  songId,
  title,
  artist,
  durationSeconds,
  sheet,
  variant,
  onClose,
}: ChordsReaderProps) {
  const prefs = useReaderPrefs(songId);
  const { theme, fontSize, lyricsOnly } = prefs;
  const setBandKey = useSetBandTranspose(bandId, songId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const page = variant === "page";

  useWakeLock(true);

  useEffect(() => {
    const mq = window.matchMedia(
      "(orientation: landscape) and (max-height: 500px)",
    );
    const sync = () => setLandscape(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const getScroller = useCallback(
    () => (page ? scrollRef.current : nearestScroller(rootRef.current)),
    [page],
  );
  const speedMultiplier = prefs.speed;
  const getSpeed = useCallback(() => {
    const el = getScroller();
    const range = el ? el.scrollHeight - el.clientHeight : 0;
    const base =
      durationSeconds && durationSeconds > 0 && range > 0
        ? Math.min(150, Math.max(6, range / durationSeconds))
        : 25;
    return base * speedMultiplier;
  }, [getScroller, durationSeconds, speedMultiplier]);
  const auto = useAutoScroll({ getScroller, getSpeed });

  const bandOffset = sheet.bandTranspose + prefs.transpose;
  const displayOffset = bandOffset - prefs.capo;
  const soundingKey = sheet.key ? transposeKey(sheet.key, bandOffset) : null;
  // Undefined lets each chord pick its own spelling when the sheet has no key.
  const flats = sheet.key
    ? prefersFlats(transposeKey(sheet.key, displayOffset))
    : undefined;
  const sections = useMemo(() => sheetSections(sheet.sheet), [sheet.sheet]);

  // Two-finger pinch zooms the text; one-finger gestures are left to the page.
  const pinch = useRef<{ dist: number; size: number } | null>(null);
  const touchDist = (e: TouchEvent) =>
    Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
  const onTouchStart = (e: TouchEvent) => {
    pinch.current =
      e.touches.length === 2 ? { dist: touchDist(e), size: fontSize } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !pinch.current) return;
    prefs.setFontSize((pinch.current.size * touchDist(e)) / pinch.current.dist);
  };

  const jump = (index: number) => {
    const target = rootRef.current?.querySelector(`[data-section="${index}"]`);
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const confirmBandKey = () => {
    setBandKey.mutate(foldSemitones(bandOffset), {
      onSuccess: () => prefs.setTranspose(0),
    });
    setConfirmOpen(false);
  };

  const dark = theme === "dark";
  const muted = dark ? "text-white/60" : "text-zinc-900/60";
  const bar = dark
    ? "bg-zinc-950 border-white/15"
    : "bg-zinc-100 border-zinc-300";

  const showTitle = page || !!onClose;
  const header: ReactNode = (
    <header
      className={cn(
        "shrink-0 border-b px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2",
        bar,
      )}
    >
      <div className={cn("flex items-center gap-1", !showTitle && "hidden")}>
        {onClose && (
          <Btn
            theme={theme}
            aria-label="Back"
            data-testid="chords-back"
            onClick={onClose}
          >
            <ArrowLeft className="size-5" />
          </Btn>
        )}
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-base font-semibold leading-tight">
            {title}
          </h1>
          <p className={cn("truncate text-xs", muted)}>
            {[
              artist,
              soundingKey && `Key ${soundingKey}`,
              sheet.capo ? `Original: capo ${sheet.capo}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      {sections.length > 0 && (
        <nav
          aria-label="Jump to section"
          className="mt-1.5 flex gap-1.5 overflow-x-auto pb-0.5"
        >
          {sections.map((s) => (
            <button
              key={s.lineIndex}
              type="button"
              data-testid="chords-section-chip"
              onClick={() => jump(s.lineIndex)}
              className={cn(
                "h-8 shrink-0 rounded-full px-3 text-xs font-semibold",
                dark
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-zinc-900/10 text-zinc-900 hover:bg-zinc-900/20",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );

  const body = (
    <div
      ref={scrollRef}
      className={cn(
        "touch-pan-x touch-pan-y px-4 py-4",
        page && "min-h-0 flex-1 overflow-y-auto overscroll-contain",
      )}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onClick={() => auto.state !== "idle" && auto.pause()}
    >
      <ChordSheetView
        sheet={sheet.sheet}
        semitones={displayOffset}
        preferFlats={flats}
        fontSize={fontSize}
        lyricsOnly={lyricsOnly}
        theme={theme}
        twoColumns={landscape}
      />
      <div className="h-[60vh]" aria-hidden />
    </div>
  );

  const controls = (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 overflow-x-auto border-t px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        !page && "sticky bottom-0 z-10",
        bar,
      )}
      role="toolbar"
      aria-label="Reader controls"
    >
      <Btn
        theme={theme}
        aria-label={
          auto.state === "idle" ? "Start auto-scroll" : "Pause auto-scroll"
        }
        data-testid="chords-autoscroll"
        data-state={auto.state}
        active={auto.state !== "idle"}
        onClick={auto.toggle}
      >
        {auto.state === "idle" ? (
          <Play className="size-5" />
        ) : (
          <Pause className="size-5" />
        )}
        {auto.state === "leadin" && <span className="text-xs">3s</span>}
      </Btn>
      <select
        aria-label="Auto-scroll speed"
        data-testid="chords-speed"
        value={speedMultiplier}
        onChange={(e) => prefs.setSpeed(Number(e.target.value))}
        className={cn(
          "h-11 shrink-0 rounded-lg px-2 text-sm",
          dark ? "bg-zinc-800 text-white" : "bg-zinc-200 text-zinc-900",
        )}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
      <Sep theme={theme} />
      <Btn
        theme={theme}
        aria-label="Transpose down"
        data-testid="chords-transpose-down"
        onClick={() => prefs.setTranspose(prefs.transpose - 1)}
      >
        <Minus className="size-4" />
      </Btn>
      <Btn
        theme={theme}
        aria-label="Reset to band key"
        data-testid="chords-transpose-reset"
        onClick={prefs.resetTranspose}
      >
        {soundingKey ?? "Key"}
        <span className={cn("text-xs", muted)}>
          {prefs.transpose !== 0 ? fmt(prefs.transpose) : ""}
        </span>
      </Btn>
      <Btn
        theme={theme}
        aria-label="Transpose up"
        data-testid="chords-transpose-up"
        onClick={() => prefs.setTranspose(prefs.transpose + 1)}
      >
        <Plus className="size-4" />
      </Btn>
      <Btn
        theme={theme}
        aria-label={`Capo ${prefs.capo}, tap to change`}
        data-testid="chords-capo"
        active={prefs.capo > 0}
        onClick={() =>
          prefs.setCapo(prefs.capo >= MAX_CAPO ? 0 : prefs.capo + 1)
        }
      >
        Capo {prefs.capo}
      </Btn>
      {prefs.transpose !== 0 && (
        <Btn
          theme={theme}
          aria-label="Set as band key"
          data-testid="chords-set-band-key"
          onClick={() => setConfirmOpen(true)}
        >
          Set as band key
        </Btn>
      )}
      <Sep theme={theme} />
      <Btn
        theme={theme}
        aria-label="Smaller text"
        data-testid="chords-zoom-out"
        onClick={() => prefs.setFontSize(fontSize - 2)}
      >
        <ZoomOut className="size-5" />
      </Btn>
      <Btn
        theme={theme}
        aria-label="Larger text"
        data-testid="chords-zoom-in"
        onClick={() => prefs.setFontSize(fontSize + 2)}
      >
        <ZoomIn className="size-5" />
      </Btn>
      <Btn
        theme={theme}
        aria-label="Lyrics only"
        aria-pressed={lyricsOnly}
        data-testid="chords-lyrics-only"
        active={lyricsOnly}
        onClick={() => prefs.setLyricsOnly(!lyricsOnly)}
      >
        <AlignLeft className="size-5" />
      </Btn>
      <Btn
        theme={theme}
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
        data-testid="chords-theme"
        onClick={() => prefs.setTheme(dark ? "light" : "dark")}
      >
        {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </Btn>
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-testid="chords-reader"
      data-theme={theme}
      className={cn(
        "flex flex-col",
        dark ? "bg-black text-white" : "bg-white text-zinc-900",
        page ? "fixed inset-0 z-50" : "relative",
      )}
    >
      {(showTitle || sections.length > 0) && header}
      {body}
      {controls}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set as band key?</AlertDialogTitle>
            <AlertDialogDescription>
              Everyone will see this song shifted{" "}
              {fmt(foldSemitones(bandOffset))} semitones from the original
              {soundingKey ? `, in the key of ${soundingKey}` : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              data-testid="chords-set-band-key-confirm"
              onClick={confirmBandKey}
            >
              Set band key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
