import { zonedInstant } from "../events/time.js";

export type ReplyPartstat = "ACCEPTED" | "TENTATIVE" | "DECLINED";

export interface ParsedReply {
  uid: string;
  partstat: ReplyPartstat;
  /** Original start of the occurrence a RECURRENCE-ID names; absent for a master reply. */
  recurrenceId?: Date;
  /** RANGE=THISANDFUTURE on the RECURRENCE-ID. */
  thisAndFuture: boolean;
}

interface Line {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(raw: string): Line | null {
  const colon = raw.indexOf(":");
  if (colon < 0) return null;
  const [name = "", ...ps] = raw.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of ps) {
    const i = p.indexOf("=");
    if (i > 0) {
      params[p.slice(0, i).toUpperCase()] = p
        .slice(i + 1)
        .replace(/^"|"$/g, "");
    }
  }
  return {
    name: name.toUpperCase(),
    params,
    value: raw.slice(colon + 1).trim(),
  };
}

/** UTC (`Z`), zoned (`TZID`) or floating (series zone) iCalendar date-time to an instant. */
function parseStamp(l: Line, fallbackZone: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(
    l.value,
  );
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (m[7] === "Z") {
    return new Date(`${date}T${m[4]}:${m[5]}:${m[6]}Z`);
  }
  const tz = l.params.TZID || fallbackZone;
  try {
    return zonedInstant(date, m[4] ? `${m[4]}:${m[5]}` : null, tz);
  } catch {
    return zonedInstant(date, m[4] ? `${m[4]}:${m[5]}` : null, fallbackZone);
  }
}

/** The answers in a METHOD:REPLY calendar; null when the text is not a reply. */
export function parseReply(
  ics: string,
  fallbackZone = "UTC",
): ParsedReply[] | null {
  const lines = ics
    .replace(/\r?\n[ \t]/g, "")
    .split(/\r?\n/)
    .map(parseLine)
    .filter((l): l is Line => l != null);
  if (
    !lines.some((l) => l.name === "METHOD" && l.value.toUpperCase() === "REPLY")
  ) {
    return null;
  }
  const out: ParsedReply[] = [];
  let cur: Line[] | null = null;
  for (const l of lines) {
    if (l.name === "BEGIN" && l.value.toUpperCase() === "VEVENT") cur = [];
    else if (l.name === "END" && l.value.toUpperCase() === "VEVENT" && cur) {
      const uid = cur.find((x) => x.name === "UID")?.value;
      const ps = cur
        .filter((x) => x.name === "ATTENDEE")
        .map((x) => x.params.PARTSTAT?.toUpperCase())
        .find((x) => x === "ACCEPTED" || x === "TENTATIVE" || x === "DECLINED");
      const rid = cur.find((x) => x.name === "RECURRENCE-ID");
      const recurrenceId = rid ? parseStamp(rid, fallbackZone) : null;
      if (uid && ps && !(rid && !recurrenceId)) {
        out.push({
          uid,
          partstat: ps,
          ...(recurrenceId ? { recurrenceId } : {}),
          thisAndFuture: rid?.params.RANGE?.toUpperCase() === "THISANDFUTURE",
        });
      }
      cur = null;
    } else cur?.push(l);
  }
  return out;
}
