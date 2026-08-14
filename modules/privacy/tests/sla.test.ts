import { describe, it, expect } from "vitest";
import { statutoryWindow, computeSlaDeadline, computeExtendedDeadline, slaState } from "../src/internal/sla";

const DAY = 86_400_000;

describe("statutoryWindow", () => {
  it("GDPR regions: 30d + 60d extension", () => {
    for (const j of ["EU", "UK", "DE", "eu"]) expect(statutoryWindow(j)).toEqual({ regime: "GDPR", responseDays: 30, extensionDays: 60 });
  });
  it("US state: 45d + 45d", () => {
    expect(statutoryWindow("US-CA").regime).toBe("US_STATE");
    expect(statutoryWindow("US").responseDays).toBe(45);
  });
  it("default: 30d + 30d", () => {
    expect(statutoryWindow("ZZ")).toEqual({ regime: "DEFAULT", responseDays: 30, extensionDays: 30 });
  });
});

describe("deadline math", () => {
  const base = new Date("2026-01-01T00:00:00Z");
  it("initial deadline uses the response window", () => {
    expect(computeSlaDeadline(base, "EU").getTime()).toBe(base.getTime() + 30 * DAY);
    expect(computeSlaDeadline(base, "US-CA").getTime()).toBe(base.getTime() + 45 * DAY);
  });
  it("extended deadline adds the extension window", () => {
    const d = computeSlaDeadline(base, "EU");
    expect(computeExtendedDeadline(d, "EU").getTime()).toBe(d.getTime() + 60 * DAY);
  });
});

describe("slaState", () => {
  const now = new Date("2026-01-10T00:00:00Z");
  it("classifies urgency and uses the extended deadline when present", () => {
    expect(slaState({ slaDeadline: new Date("2026-01-05T00:00:00Z"), extendedDeadline: null }, now)).toMatchObject({ urgency: "BREACHED", breached: true });
    expect(slaState({ slaDeadline: new Date("2026-01-10T00:00:00Z"), extendedDeadline: null }, now).urgency).toBe("DUE_TODAY");
    expect(slaState({ slaDeadline: new Date("2026-01-14T00:00:00Z"), extendedDeadline: null }, now).urgency).toBe("DUE_SOON");
    expect(slaState({ slaDeadline: new Date("2026-02-10T00:00:00Z"), extendedDeadline: null }, now).urgency).toBe("ON_TRACK");
  });
  it("extension can rescue a would-be breach", () => {
    const s = slaState({ slaDeadline: new Date("2026-01-05T00:00:00Z"), extendedDeadline: new Date("2026-03-05T00:00:00Z") }, now);
    expect(s.breached).toBe(false);
    expect(s.extended).toBe(true);
  });
});
