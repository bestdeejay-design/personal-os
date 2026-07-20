// Минимальный генератор .ics (RFC5545): VCALENDAR / VEVENT
// с UID, DTSTART, DTEND, SUMMARY, DESCRIPTION.

export interface IcsMeeting {
  uid: string;
  start: Date | string;
  end: Date | string;
  summary: string;
  description?: string;
}

function toIcsDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  // YYYYMMDDTHHMMSSZ в UTC
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

export function toIcs(meeting: IcsMeeting): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PersonalOS//EN",
    "CALSCALE:GREGORIAN",
    `UID:${meeting.uid}`,
    `DTSTART:${toIcsDate(meeting.start)}`,
    `DTEND:${toIcsDate(meeting.end)}`,
    `SUMMARY:${escapeText(meeting.summary)}`,
  ];
  if (meeting.description && meeting.description.length > 0) {
    lines.push(`DESCRIPTION:${escapeText(meeting.description)}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}
