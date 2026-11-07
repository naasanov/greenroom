/** Minimal MIME walker: the decoded text of every iCalendar part of a raw message. */

interface Part {
  type: string;
  params: Record<string, string>;
  encoding: string;
  disposition: string;
  body: Buffer;
}

function parseHeaders(block: string): Map<string, string> {
  const out = new Map<string, string>();
  const unfolded = block.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0)
      out.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return out;
}

function parseValue(v: string): {
  value: string;
  params: Record<string, string>;
} {
  const [first = "", ...rest] = v.split(";");
  const params: Record<string, string> = {};
  for (const p of rest) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    params[p.slice(0, i).trim().toLowerCase()] = p
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "");
  }
  return { value: first.trim().toLowerCase(), params };
}

function split(raw: Buffer): { headers: Map<string, string>; body: Buffer } {
  const text = raw.toString("latin1");
  const m = /\r?\n\r?\n/.exec(text);
  if (!m) return { headers: parseHeaders(text), body: Buffer.alloc(0) };
  return {
    headers: parseHeaders(text.slice(0, m.index)),
    body: Buffer.from(text.slice(m.index + m[0].length), "latin1"),
  };
}

function decodeQuotedPrintable(b: Buffer): Buffer {
  const s = b.toString("latin1").replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const hex = s.slice(i + 1, i + 3);
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(hex)) {
      out.push(parseInt(hex, 16));
      i += 2;
    } else out.push(s.charCodeAt(i) & 0xff);
  }
  return Buffer.from(out);
}

function decodeBody(p: Part): string {
  let bytes = p.body;
  if (p.encoding === "base64") {
    bytes = Buffer.from(
      p.body.toString("latin1").replace(/\s+/g, ""),
      "base64",
    );
  } else if (p.encoding === "quoted-printable") {
    bytes = decodeQuotedPrintable(p.body);
  }
  try {
    return new TextDecoder(p.params.charset || "utf-8").decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

function isCalendar(p: Part): boolean {
  if (p.type === "text/calendar" || p.type === "application/ics") return true;
  const name = (p.params.name ?? "").toLowerCase();
  return /\.ics$/.test(name) && p.type === "application/octet-stream";
}

function walk(raw: Buffer, out: string[], depth: number): void {
  if (depth > 6) return;
  const { headers, body } = split(raw);
  const ct = parseValue(headers.get("content-type") ?? "text/plain");
  if (ct.value.startsWith("multipart/") && ct.params.boundary) {
    const delim = `--${ct.params.boundary}`;
    const chunks = body.toString("latin1").split(delim);
    // The first chunk is the preamble; the closing delimiter leaves a "--" chunk.
    for (const chunk of chunks.slice(1)) {
      if (chunk.startsWith("--")) break;
      walk(Buffer.from(chunk.replace(/^\r?\n/, ""), "latin1"), out, depth + 1);
    }
    return;
  }
  if (ct.value === "message/rfc822") return walk(body, out, depth + 1);
  const disp = parseValue(headers.get("content-disposition") ?? "");
  const part: Part = {
    type: ct.value,
    params: { ...disp.params, ...ct.params },
    encoding: (
      headers.get("content-transfer-encoding") ?? "7bit"
    ).toLowerCase(),
    disposition: disp.value,
    body,
  };
  if (isCalendar(part)) out.push(decodeBody(part));
}

export function extractCalendarParts(raw: Buffer): string[] {
  const out: string[] = [];
  walk(raw, out, 0);
  return out;
}
