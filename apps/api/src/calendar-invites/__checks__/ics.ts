// Pure checks for the iCalendar builder. Compile to a temp outDir and run with node (see README).
import assert from "node:assert/strict";
import { buildCalendar, foldLine, escapeText, vtimezone } from "../ics.js";
import { inviteToken, parseInviteToken, replyAddress } from "../reply-token.js";

const base = {
  uid: "series-1@greenroom.fyi",
  sequence: 2,
  summary: "Practice, loud; very",
  allDay: false,
  organizer: { email: "rsvp+abc@greenroom.fyi", name: "Band via Greenroom" },
  attendee: { email: "a@b.co", name: "Ava", partstat: "NEEDS-ACTION" as const },
};
const dtstamp = new Date("2026-11-06T12:00:00Z");

let ny = buildCalendar({
  method: "REQUEST",
  dtstamp,
  events: [
    {
      ...base,
      timeZone: "America/New_York",
      start: "2026-11-10T00:00:00Z",
      end: "2026-11-10T02:00:00Z",
      rrule: "RRULE:FREQ=WEEKLY;BYDAY=TU",
      exdates: ["2026-11-17T00:00:00Z"],
      description: "Line one\nLine two; with, punctuation",
    },
    {
      ...base,
      timeZone: "America/New_York",
      start: "2026-11-25T00:00:00Z",
      end: "2026-11-25T02:00:00Z",
      recurrenceId: "2026-11-24T00:00:00Z",
    },
  ],
});
ny = ny.replace(/\r\n /g, "");
assert.ok(ny.startsWith("BEGIN:VCALENDAR\r\n"));
assert.ok(ny.endsWith("END:VCALENDAR\r\n"));
assert.ok(ny.includes("METHOD:REQUEST\r\n"));
assert.ok(ny.includes("DTSTART;TZID=America/New_York:20261109T190000\r\n"));
assert.ok(ny.includes("RRULE:FREQ=WEEKLY;BYDAY=TU\r\n"));
assert.ok(ny.includes("EXDATE;TZID=America/New_York:20261116T190000\r\n"));
assert.ok(
  ny.includes("RECURRENCE-ID;TZID=America/New_York:20261123T190000\r\n"),
);
assert.ok(ny.includes("SUMMARY:Practice\\, loud\\; very\r\n"));
assert.ok(ny.includes("SEQUENCE:2\r\n"));
assert.ok(ny.includes("PARTSTAT=NEEDS-ACTION;RSVP=TRUE"));
assert.ok(
  ny.includes(
    "TZOFFSETFROM:-0500\r\nTZOFFSETTO:-0400\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  ),
);
assert.ok(
  ny.includes(
    "BEGIN:STANDARD\r\nDTSTART:20251102T020000\r\nTZOFFSETFROM:-0400\r\nTZOFFSETTO:-0500\r\nRRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  ),
);

const cancel = buildCalendar({
  method: "CANCEL",
  dtstamp,
  events: [
    {
      ...base,
      timeZone: "UTC",
      start: "2026-11-10T19:00:00Z",
      end: "2026-11-10T21:00:00Z",
    },
  ],
});
assert.ok(
  cancel.includes("METHOD:CANCEL") && cancel.includes("STATUS:CANCELLED"),
);
assert.ok(
  cancel.includes("DTSTART:20261110T190000Z") && !cancel.includes("VTIMEZONE"),
);

const allDay = buildCalendar({
  method: "REQUEST",
  dtstamp,
  events: [
    {
      ...base,
      allDay: true,
      timeZone: "Europe/Berlin",
      start: "2026-12-01",
      end: "2026-12-02",
    },
  ],
});
assert.ok(
  allDay.includes(
    "DTSTART;VALUE=DATE:20261201\r\nDTEND;VALUE=DATE:20261202\r\n",
  ),
);

// Southern hemisphere and non-DST zones.
const syd = vtimezone("Australia/Sydney", 2025, 2027).join("\n");
assert.ok(
  syd.includes("BEGIN:DAYLIGHT") && syd.includes("BYMONTH=10;BYDAY=1SU"),
  syd,
);
const phx = vtimezone("America/Phoenix", 2026, 2027).join("\n");
assert.ok(phx.includes("TZOFFSETTO:-0700") && !phx.includes("RRULE"));
const kol = vtimezone("Asia/Kolkata", 2026, 2027).join("\n");
assert.ok(kol.includes("TZOFFSETTO:+0530"));
const eu = vtimezone("Europe/London", 2026, 2027).join("\n");
assert.ok(
  eu.includes("BYMONTH=3;BYDAY=-1SU") && eu.includes("BYMONTH=10;BYDAY=-1SU"),
  eu,
);

// Folding: every physical line is at most 75 octets and unfolds back to the original.
const long = "DESCRIPTION:" + "é漢,".repeat(60);
const folded = foldLine(long);
for (const l of folded.split("\r\n")) assert.ok(Buffer.byteLength(l) <= 75);
assert.equal(folded.replace(/\r\n /g, ""), long);
assert.equal(escapeText("a\\b\nc"), "a\\\\b\\nc");

// Reply tokens round trip and reject tampering.
const id = "11111111-2222-4333-8444-555555555555";
const tok = inviteToken("series", id);
assert.deepEqual(parseInviteToken(tok), { kind: "series", eventId: id });
assert.equal(
  parseInviteToken(tok.slice(0, -1) + (tok.endsWith("0") ? "1" : "0")),
  null,
);
assert.ok(replyAddress("gig", id).startsWith("rsvp+g"));
console.log("ics checks passed");
