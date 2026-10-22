/** Passcode sign-in replaces Google in fake mode only when a passcode secret is set. */
export function stagingLoginEnabled(): boolean {
  return (
    process.env.INTEGRATIONS_MODE === "fake" &&
    !!process.env.STAGING_LOGIN_PASSCODE
  );
}
