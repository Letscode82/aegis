import { describe, it, expect } from "vitest";
import { buildKeyDatesICS, escapeICSText } from "../src/internal/key-dates";
import type { KeyDate } from "../src/internal/key-dates";

const NOW = new Date("2026-07-01T12:00:00Z");

const sample: KeyDate[] = [
  {
    id: "exp-c1",
    date: "2026-08-15T00:00:00.000Z",
    kind: "CONTRACT_EXPIRY",
    contractId: "c1",
    contractTitle: "Globex Supply; Ltd",
    counterpartyName: "Globex, Inc.",
    title: "Expiry — Globex Supply; Ltd",
    detail: "Supply contract expires on this date.",
    severity: "medium",
    daysOut: 45,
  },
];

describe("escapeICSText", () => {
  it("escapes commas, semicolons, backslashes, newlines", () => {
    expect(escapeICSText("a, b; c\\d\ne")).toBe("a\\, b\\; c\\\\d\\ne");
  });
});

describe("buildKeyDatesICS", () => {
  const ics = buildKeyDatesICS(sample, { now: NOW, calendarName: "Test Cal" });

  it("emits a well-formed VCALENDAR with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Test Cal");
  });

  it("renders an all-day VEVENT with a stable UID and DTSTART date", () => {
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("UID:exp-c1@aegis-clm");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260815");
    expect(ics).toContain("DTSTAMP:20260701T120000Z");
  });

  it("escapes special characters in SUMMARY / DESCRIPTION", () => {
    expect(ics).toContain("SUMMARY:[CONTRACT EXPIRY] Expiry — Globex Supply\\; Ltd");
    expect(ics).toContain("Counterparty: Globex\\, Inc.");
  });

  it("includes a 7-day-prior reminder alarm per event", () => {
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-P7D");
    expect(ics).toContain("ACTION:DISPLAY");
  });

  it("emits one VEVENT per key date", () => {
    const many = buildKeyDatesICS([sample[0], { ...sample[0], id: "exp-c2" }], { now: NOW });
    expect(many.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});
