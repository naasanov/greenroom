import type { BandMember } from "@greenroom/shared";

/** Preset keys then custom names, in the order the member listed them. */
export function memberInstruments(member: BandMember): string[] {
  return [...member.instruments.presets, ...member.instruments.custom];
}
