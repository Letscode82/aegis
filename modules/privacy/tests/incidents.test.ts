import { describe, it, expect } from "vitest";
import { computeClock, BREACH_NOTIFY_HOURS } from "../src/internal/incidents";

describe("breach 72-hour clock", () => {
  it("running before the deadline", () => {
    const discovered = new Date(Date.now() - 10 * 3_600_000); // 10h ago
    const c = computeClock(discovered, false);
    expect(c.notified).toBe(false);
    expect(c.breached).toBe(false);
    expect(c.hoursRemaining).toBeGreaterThan(0);
  });
  it("breached past the deadline when not notified", () => {
    const discovered = new Date(Date.now() - (BREACH_NOTIFY_HOURS + 5) * 3_600_000);
    const c = computeClock(discovered, false);
    expect(c.breached).toBe(true);
    expect(c.hoursRemaining).toBeLessThan(0);
  });
  it("notified stops the clock (never breached)", () => {
    const discovered = new Date(Date.now() - 200 * 3_600_000);
    const c = computeClock(discovered, true);
    expect(c.notified).toBe(true);
    expect(c.breached).toBe(false);
    expect(c.hoursRemaining).toBeNull();
  });
});
