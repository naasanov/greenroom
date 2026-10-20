/** True only when fakes are bound and the process is not production. */
export function testingEnabled(): boolean {
  return (
    process.env.INTEGRATIONS_MODE === "fake" &&
    process.env.NODE_ENV !== "production"
  );
}
