/** Same-site relative paths only; anything else falls back to the home page. */
export function safeRedirectTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.includes("\\")) return "/";
  return value;
}

export const signInUrl = (redirectTo: string): string =>
  `/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`;
