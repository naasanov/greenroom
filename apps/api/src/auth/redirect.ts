/** Returns the path if it is a same-site relative path, else "/". */
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048)
    return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  // Backslashes and control characters are normalized by browsers into other hosts.
  for (const ch of value) {
    if (ch === "\\" || ch.charCodeAt(0) < 0x20) return "/";
  }
  return value;
}
