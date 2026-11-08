const KEY = "greenroom.welcome-pending";

/** Marks a new sign-in as still owing the welcome step; cleared once it is saved. */
export function setWelcomePending(pending: boolean): void {
  try {
    if (pending) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    // Without storage the welcome step is simply not re-offered.
  }
}

export function isWelcomePending(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
