import {
  Drum,
  Guitar,
  GuitarElectric,
  KeyboardMusic,
  MicVocal,
  Music2,
  Piano,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SaxophoneIcon,
  TrumpetIcon,
  ViolinIcon,
} from "@/components/app/instrument-icons";

type IconComponent = LucideIcon | typeof SaxophoneIcon;

export interface Instrument {
  key: string;
  label: string;
  icon: IconComponent;
}

/** Preset instrument list shared by onboarding, the roster, and the picker. */
export const INSTRUMENTS: readonly Instrument[] = [
  { key: "vocals", label: "Vocals", icon: MicVocal },
  { key: "guitar", label: "Guitar", icon: Guitar },
  { key: "bass", label: "Bass", icon: GuitarElectric },
  { key: "drums", label: "Drums", icon: Drum },
  { key: "keys", label: "Keys / Piano", icon: Piano },
  { key: "synth", label: "Synth", icon: KeyboardMusic },
  { key: "saxophone", label: "Saxophone", icon: SaxophoneIcon },
  { key: "trumpet", label: "Trumpet", icon: TrumpetIcon },
  { key: "violin", label: "Violin", icon: ViolinIcon },
  { key: "other", label: "Other", icon: Music2 },
];

/** Icon for instruments typed in by the user (anything outside the presets). */
export const CUSTOM_INSTRUMENT_ICON: IconComponent = Music2;

export function findInstrument(key: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.key === key);
}

/** Renders the preset icon for a key, or the generic icon for a custom one. */
export function InstrumentIcon({
  instrument,
  className,
}: {
  instrument: string;
  className?: string;
}) {
  const Icon = findInstrument(instrument)?.icon ?? CUSTOM_INSTRUMENT_ICON;
  return <Icon className={cn("size-5", className)} />;
}

/** Display label for a key; custom instruments display as typed. */
export function instrumentLabel(key: string): string {
  return findInstrument(key)?.label ?? key;
}
