import { describe, it, expect } from "vitest";
import { aggregateDashboard, type DashboardRow } from "../src/internal/dashboard";
import { buildResponsePackage } from "../src/internal/delivery";
import { summarizeReview } from "../src/internal/review";

const now = new Date("2026-06-15T00:00:00Z");

function row(p: Partial<DashboardRow>): DashboardRow {
  return {
    id: Math.random().toString(36).slice(2),
    requestType: "ACCESS",
    status: "IN_PROGRESS",
    assignedToUserId: null,
    submittedAt: new Date("2026-06-01T00:00:00Z"),
    slaDeadline: new Date("2026-07-01T00:00:00Z"),
    extendedDeadline: null,
    ...p,
  } as DashboardRow;
}

describe("aggregateDashboard", () => {
  it("buckets open vs terminal, overdue, and by type/handler", () => {
    const rows = [
      row({ requestType: "ACCESS", status: "IN_PROGRESS", assignedToUserId: "u1", slaDeadline: new Date("2026-06-10T00:00:00Z") }), // overdue
      row({ requestType: "ERASURE", status: "AWAITING_REVIEW", assignedToUserId: "u1", slaDeadline: new Date("2026-06-18T00:00:00Z") }), // due soon
      row({ requestType: "ACCESS", status: "FULFILLED" }),
      row({ requestType: "ACCESS", status: "RECEIVED", assignedToUserId: null, slaDeadline: new Date("2026-08-01T00:00:00Z") }), // on track
    ];
    const d = aggregateDashboard(rows, new Map([["u1", "Dana"]]), now);
    expect(d.totals.all).toBe(4);
    expect(d.totals.open).toBe(3);
    expect(d.totals.overdue).toBe(1);
    expect(d.totals.fulfilled).toBe(1);
    expect(d.byType.ACCESS).toBe(3);
    expect(d.queueHealth.breached).toBe(1);
    const dana = d.byHandler.find((h) => h.userId === "u1");
    expect(dana).toMatchObject({ name: "Dana", open: 2 });
    expect(d.byHandler.find((h) => h.userId === null)).toMatchObject({ name: "Unassigned", open: 1 });
    expect(d.volumeByMonth).toHaveLength(6);
  });
});

describe("buildResponsePackage", () => {
  it("includes validated-relevant, redacts flagged, excludes the rest", () => {
    const items = [
      { title: "A", sourceSystem: "CRM", reviewDecision: "CONFIRMED", finalRelevant: true, redact: false, redactionNote: null },
      { title: "B", sourceSystem: "HR", reviewDecision: "CONFIRMED", finalRelevant: true, redact: true, redactionNote: "third-party name" },
      { title: "C", sourceSystem: "DB", reviewDecision: "OVERRIDDEN", finalRelevant: false, redact: false, redactionNote: null },
      { title: "D", sourceSystem: "DB", reviewDecision: "PENDING", finalRelevant: null, redact: false, redactionNote: null },
    ];
    const pkg = buildResponsePackage("req1", items, 3, now);
    expect(pkg.includedCount).toBe(2);
    expect(pkg.redactedCount).toBe(1);
    expect(pkg.excludedCount).toBe(2); // C (not relevant) + D (pending)
    expect(pkg.dataLocationsWithData).toBe(3);
    expect(pkg.items.find((i) => i.title === "B")?.disclosure).toBe("REDACTED");
  });
});

describe("summarizeReview", () => {
  it("counts pending / validated / relevant / redacted", () => {
    const s = summarizeReview([
      { reviewDecision: "PENDING", finalRelevant: null, redact: false },
      { reviewDecision: "CONFIRMED", finalRelevant: true, redact: true },
      { reviewDecision: "OVERRIDDEN", finalRelevant: false, redact: false },
    ]);
    expect(s).toEqual({ total: 3, pending: 1, validated: 2, relevant: 1, redacted: 1 });
  });
});
