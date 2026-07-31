import { describe, it, expect } from "vitest";
import { parseRecurrence, nextOccurrence, recurrenceLabel, addMonths } from "../src/internal/recurrence";

describe("parseRecurrence", () => {
  it("parses RRULE FREQ + INTERVAL", () => {
    expect(parseRecurrence("FREQ=MONTHLY;INTERVAL=2")).toEqual({ freq: "MONTHLY", interval: 2 });
    expect(parseRecurrence("FREQ=YEARLY")).toEqual({ freq: "YEARLY", interval: 1 });
  });
  it("accepts bare keyword + lowercase + whitespace", () => {
    expect(parseRecurrence("quarterly")).toEqual({ freq: "QUARTERLY", interval: 1 });
    expect(parseRecurrence("  MONTHLY  ")).toEqual({ freq: "MONTHLY", interval: 1 });
  });
  it("returns null for empty / unparseable", () => {
    expect(parseRecurrence(null)).toBeNull();
    expect(parseRecurrence("")).toBeNull();
    expect(parseRecurrence("FREQ=FORTNIGHTLY")).toBeNull();
  });
});

describe("addMonths — clamps to month length", () => {
  it("Jan 31 + 1 month → Feb 28 (non-leap)", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });
  it("Jan 31 + 1 month → Feb 29 (leap)", () => {
    expect(addMonths(new Date("2028-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2028-02-29");
  });
  it("crosses year boundary", () => {
    expect(addMonths(new Date("2026-11-15T00:00:00Z"), 3).toISOString().slice(0, 10)).toBe("2027-02-15");
  });
});

describe("nextOccurrence", () => {
  const from = new Date("2026-03-15T00:00:00Z");
  it("weekly / monthly / quarterly / yearly with interval", () => {
    expect(nextOccurrence("FREQ=WEEKLY", from).toISOString().slice(0, 10)).toBe("2026-03-22");
    expect(nextOccurrence("FREQ=MONTHLY", from).toISOString().slice(0, 10)).toBe("2026-04-15");
    expect(nextOccurrence("QUARTERLY", from).toISOString().slice(0, 10)).toBe("2026-06-15");
    expect(nextOccurrence("FREQ=YEARLY", from).toISOString().slice(0, 10)).toBe("2027-03-15");
    expect(nextOccurrence("FREQ=MONTHLY;INTERVAL=2", from).toISOString().slice(0, 10)).toBe("2026-05-15");
  });
  it("returns null for one-shot / unparseable", () => {
    expect(nextOccurrence(null, from)).toBeNull();
    expect(nextOccurrence("nonsense", from)).toBeNull();
  });
});

describe("recurrenceLabel", () => {
  it("renders singular and plural", () => {
    expect(recurrenceLabel("FREQ=MONTHLY")).toBe("Every month");
    expect(recurrenceLabel("FREQ=MONTHLY;INTERVAL=3")).toBe("Every 3 months");
    expect(recurrenceLabel("QUARTERLY")).toBe("Every quarter");
    expect(recurrenceLabel(null)).toBeNull();
  });
});
