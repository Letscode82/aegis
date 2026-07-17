import { describe, it, expect } from "vitest";
import {
  daysToExpiry,
  expiryBucket,
  obligationOverdue,
  rollupClauseRisk,
} from "../src/internal/derive";

const NOW = new Date("2026-07-17T00:00:00.000Z");
const d = (iso: string) => new Date(iso);

describe("daysToExpiry", () => {
  it("returns null with no expiry", () => {
    expect(daysToExpiry(NOW, null)).toBeNull();
    expect(daysToExpiry(NOW, undefined)).toBeNull();
  });
  it("counts whole days forward", () => {
    expect(daysToExpiry(NOW, d("2026-07-27T00:00:00.000Z"))).toBe(10);
  });
  it("goes negative once expired", () => {
    expect(daysToExpiry(NOW, d("2026-07-07T00:00:00.000Z"))).toBe(-10);
  });
});

describe("expiryBucket", () => {
  it("none when no date", () => expect(expiryBucket(null)).toBe("none"));
  it("expired when negative", () => expect(expiryBucket(-1)).toBe("expired"));
  it("expiring within the window", () => {
    expect(expiryBucket(0)).toBe("expiring");
    expect(expiryBucket(90)).toBe("expiring");
  });
  it("ok beyond the window", () => expect(expiryBucket(91)).toBe("ok"));
  it("honours a custom window", () => {
    expect(expiryBucket(45, 30)).toBe("ok");
    expect(expiryBucket(20, 30)).toBe("expiring");
  });
});

describe("obligationOverdue", () => {
  it("false without a due date", () => {
    expect(obligationOverdue(null, "OPEN", NOW)).toBe(false);
  });
  it("true when past due and still open/in-progress", () => {
    expect(obligationOverdue(d("2026-07-01T00:00:00.000Z"), "OPEN", NOW)).toBe(true);
    expect(obligationOverdue(d("2026-07-01T00:00:00.000Z"), "IN_PROGRESS", NOW)).toBe(true);
  });
  it("false when the obligation is already resolved", () => {
    expect(obligationOverdue(d("2026-07-01T00:00:00.000Z"), "MET", NOW)).toBe(false);
    expect(obligationOverdue(d("2026-07-01T00:00:00.000Z"), "WAIVED", NOW)).toBe(false);
  });
  it("false when the due date is in the future", () => {
    expect(obligationOverdue(d("2026-08-01T00:00:00.000Z"), "OPEN", NOW)).toBe(false);
  });
});

describe("rollupClauseRisk", () => {
  it("empty set is LOW / zero deviations", () => {
    expect(rollupClauseRisk([])).toEqual({ risk: "LOW", deviationCount: 0 });
  });
  it("HIGH beats MEDIUM beats LOW", () => {
    expect(rollupClauseRisk([{ risk: "LOW", deviation: false }, { risk: "MEDIUM", deviation: false }]).risk).toBe("MEDIUM");
    expect(rollupClauseRisk([{ risk: "MEDIUM", deviation: false }, { risk: "HIGH", deviation: false }]).risk).toBe("HIGH");
  });
  it("counts deviations independent of risk", () => {
    const r = rollupClauseRisk([
      { risk: "HIGH", deviation: true },
      { risk: "LOW", deviation: true },
      { risk: "MEDIUM", deviation: false },
    ]);
    expect(r).toEqual({ risk: "HIGH", deviationCount: 2 });
  });
});
