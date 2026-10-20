import type { Database } from "../client.js";
import { seedBand, type BandSeedResult } from "./band.js";
import { resetDatabase } from "./reset.js";

export * from "./fixtures.js";
export { resetDatabase } from "./reset.js";
export type { BandSeedResult } from "./band.js";

export const SCENARIOS = ["empty", "band"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export type SeedResult = { scenario: "empty" } | BandSeedResult;

export function isScenario(value: unknown): value is Scenario {
  return (SCENARIOS as readonly unknown[]).includes(value);
}

/** Resets all app tables, then loads the scenario. Dates are relative to `now`. */
export async function seedScenario(
  db: Database,
  scenario: Scenario,
  now: Date = new Date(),
): Promise<SeedResult> {
  await resetDatabase(db);
  if (scenario === "band") return seedBand(db, now);
  return { scenario: "empty" };
}
