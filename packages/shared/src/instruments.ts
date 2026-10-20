export const PRESET_INSTRUMENTS = [
  { key: "vocals", label: "Vocals" },
  { key: "guitar", label: "Guitar" },
  { key: "bass", label: "Bass" },
  { key: "drums", label: "Drums" },
  { key: "keys", label: "Keys" },
  { key: "synth", label: "Synth" },
  { key: "saxophone", label: "Saxophone" },
  { key: "trumpet", label: "Trumpet" },
  { key: "violin", label: "Violin" },
  { key: "other", label: "Other" },
] as const;

export const PRESET_INSTRUMENT_KEYS = PRESET_INSTRUMENTS.map((i) => i.key) as [
  PresetInstrumentKey,
  ...PresetInstrumentKey[],
];

export type PresetInstrumentKey = (typeof PRESET_INSTRUMENTS)[number]["key"];
