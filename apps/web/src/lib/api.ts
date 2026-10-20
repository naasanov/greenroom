import { healthResponseSchema, type HealthResponse } from "@greenroom/shared";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Fetches /health and validates the payload against the shared schema.
export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${apiUrl}/health`);
  return healthResponseSchema.parse(await res.json());
}
