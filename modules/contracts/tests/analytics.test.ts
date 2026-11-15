import { describe, it, expect } from "vitest";
import {
  computePortfolioTotals,
  distributionBy,
  computeCycleTime,
  computeValueAtRisk,
  computeRenewalForecast,
  computeObligationCompliance,
  computeClauseDeviations,
  computeCounterpartyConcentration,
  assembleContractAnalytics,
  type AnalyticsContractRow,
  type AnalyticsObligationRow,
  type AnalyticsClauseRow,
} from "../src/internal/analytics";

const day = (iso: string) => new Date(iso + "T00:00:00Z");

function contract(p: Partial<AnalyticsContractRow>): AnalyticsContractRow {
  return {
    id: p.id ?? "c1",
    type: p.type ?? "NDA",
    status: p.status ?? "ACTIVE",
    risk: p.risk ?? "LOW",
    value: p.value ?? null,
    currency: p.currency ?? "USD",
    counterpartyId: p.counterpartyId ?? null,
    counterpartyName: p.counterpartyName ?? null,
    autoRenew: p.autoRenew ?? false,
    effectiveDate: p.effectiveDate ?? null,
    expiryDate: p.expiryDate ?? null,
    createdAt: p.createdAt ?? day("2026-01-01"),
    executedAt: p.executedAt ?? null,
  };
}

describe("computePortfolioTotals", () => {
  it("splits live vs in-flight and sums value + high-risk live exposure", () => {
    const rows = [
      contract({ id: "a", status: "ACTIVE", value: 100, risk: "HIGH" }),
      contract({ id: "b", status: "EXECUTED", value: 50, risk: "LOW" }),
      contract({ id: "c", status: "DRAFT", value: 999, risk: "HIGH" }),
      contract({ id: "d", status: "IN_REVIEW", value: null }),
    ];
    const t = computePortfolioTotals(rows);
    expect(t.total).toBe(4);
    expect(t.live).toBe(2);
    expect(t.inFlight).toBe(2);
    expect(t.totalValue).toBe(1149);
    expect(t.liveValue).toBe(150);
    expect(t.highRiskLiveValue).toBe(100); // DRAFT high-risk excluded (not live)
  });
  it("picks the majority currency for the header label", () => {
    const rows = [
      contract({ value: 1, currency: "EUR" }),
      contract({ value: 1, currency: "EUR" }),
      contract({ value: 1, currency: "USD" }),
    ];
    expect(computePortfolioTotals(rows).currency).toBe("EUR");
  });
});

describe("distributionBy", () => {
  it("groups count + value and sorts by count desc", () => {
    const rows = [
      contract({ type: "NDA", value: 10 }),
      contract({ type: "NDA", value: 20 }),
      contract({ type: "MSA", value: 100 }),
    ];
    const d = distributionBy(rows, (r) => r.type);
    expect(d[0]).toEqual({ key: "NDA", count: 2, value: 30 });
    expect(d[1]).toEqual({ key: "MSA", count: 1, value: 100 });
  });
});

describe("computeCycleTime", () => {
  it("computes avg/median/fastest/slowest over executed contracts", () => {
    const rows = [
      contract({ id: "a", createdAt: day("2026-01-01"), executedAt: day("2026-01-11") }), // 10d
      contract({ id: "b", createdAt: day("2026-01-01"), executedAt: day("2026-01-21") }), // 20d
      contract({ id: "c", createdAt: day("2026-01-01"), executedAt: day("2026-01-31") }), // 30d
    ];
    const s = computeCycleTime(rows, day("2026-02-01"));
    expect(s.executedCount).toBe(3);
    expect(s.avgDays).toBe(20);
    expect(s.medianDays).toBe(20);
    expect(s.fastestDays).toBe(10);
    expect(s.slowestDays).toBe(30);
  });
  it("tracks oldest in-flight age and ignores unexecuted for duration", () => {
    const s = computeCycleTime(
      [contract({ status: "IN_NEGOTIATION", createdAt: day("2026-01-01"), executedAt: null })],
      day("2026-01-31"),
    );
    expect(s.executedCount).toBe(0);
    expect(s.avgDays).toBeNull();
    expect(s.inFlightCount).toBe(1);
    expect(s.oldestInFlightDays).toBe(30);
  });
  it("median of an even count averages the middle two", () => {
    const rows = [
      contract({ id: "a", createdAt: day("2026-01-01"), executedAt: day("2026-01-05") }), // 4
      contract({ id: "b", createdAt: day("2026-01-01"), executedAt: day("2026-01-11") }), // 10
    ];
    expect(computeCycleTime(rows).medianDays).toBe(7);
  });
});

describe("computeValueAtRisk", () => {
  it("buckets only live contract value by risk band, HIGH first", () => {
    const rows = [
      contract({ status: "ACTIVE", risk: "HIGH", value: 100 }),
      contract({ status: "EXECUTED", risk: "MEDIUM", value: 40 }),
      contract({ status: "DRAFT", risk: "HIGH", value: 999 }), // not live
    ];
    const v = computeValueAtRisk(rows);
    expect(v.map((b) => b.band)).toEqual(["HIGH", "MEDIUM", "LOW"]);
    expect(v[0]).toEqual({ band: "HIGH", count: 1, value: 100 });
    expect(v[1]).toEqual({ band: "MEDIUM", count: 1, value: 40 });
    expect(v[2]).toEqual({ band: "LOW", count: 0, value: 0 });
  });
});

describe("computeRenewalForecast", () => {
  const now = day("2026-06-01");
  it("buckets live contracts expiring within the horizon by month", () => {
    const rows = [
      contract({ status: "ACTIVE", value: 100, autoRenew: true, expiryDate: day("2026-07-15") }),
      contract({ status: "EXECUTED", value: 50, autoRenew: false, expiryDate: day("2026-07-20") }),
      contract({ status: "ACTIVE", value: 200, expiryDate: day("2026-09-10") }),
      contract({ status: "ACTIVE", value: 999, expiryDate: day("2027-06-01") }), // beyond horizon
      contract({ status: "ACTIVE", value: 1, expiryDate: day("2026-05-01") }), // already expired
      contract({ status: "DRAFT", value: 5, expiryDate: day("2026-07-01") }), // not live
    ];
    const f = computeRenewalForecast(rows, now, 180);
    expect(f.totalUpForRenewal).toBe(3);
    expect(f.valueUpForRenewal).toBe(350);
    expect(f.autoRenewCount).toBe(1);
    expect(f.manualCount).toBe(2);
    expect(f.expiredUnresolved).toBe(1);
    expect(f.buckets.map((b) => b.month)).toEqual(["2026-07", "2026-09"]);
    expect(f.buckets[0]).toEqual({ month: "2026-07", count: 2, value: 150, autoRenewCount: 1 });
  });
});

describe("computeObligationCompliance", () => {
  const now = day("2026-06-01");
  it("computes a compliance rate from met / (met+breached+overdueOpen)", () => {
    const rows: AnalyticsObligationRow[] = [
      { status: "MET", dueDate: null },
      { status: "MET", dueDate: null },
      { status: "MET", dueDate: null },
      { status: "BREACHED", dueDate: null },
      { status: "OPEN", dueDate: day("2026-05-01") }, // overdue
      { status: "OPEN", dueDate: day("2026-12-01") }, // not overdue → excluded from denom
      { status: "WAIVED", dueDate: null },
    ];
    const c = computeObligationCompliance(rows, now);
    expect(c.met).toBe(3);
    expect(c.breached).toBe(1);
    expect(c.overdueOpen).toBe(1);
    expect(c.waived).toBe(1);
    expect(c.complianceRate).toBe(0.6); // 3 / (3+1+1)
  });
  it("returns null compliance when nothing is measurable", () => {
    expect(computeObligationCompliance([], now).complianceRate).toBeNull();
    expect(computeObligationCompliance([{ status: "OPEN", dueDate: day("2026-12-01") }], now).complianceRate).toBeNull();
  });
});

describe("computeClauseDeviations", () => {
  it("ranks clause types by deviation rate", () => {
    const rows: AnalyticsClauseRow[] = [
      { type: "Liability", deviation: true },
      { type: "Liability", deviation: true },
      { type: "Liability", deviation: false },
      { type: "Confidentiality", deviation: false },
      { type: "Confidentiality", deviation: false },
    ];
    const d = computeClauseDeviations(rows);
    expect(d[0]).toEqual({ type: "Liability", total: 3, deviations: 2, deviationRate: 0.67 });
    expect(d[1]).toEqual({ type: "Confidentiality", total: 2, deviations: 0, deviationRate: 0 });
  });
});

describe("computeCounterpartyConcentration", () => {
  it("ranks counterparties by live value with portfolio share", () => {
    const rows = [
      contract({ status: "ACTIVE", counterpartyId: "cp1", counterpartyName: "Acme", value: 300 }),
      contract({ status: "EXECUTED", counterpartyId: "cp1", counterpartyName: "Acme", value: 100 }),
      contract({ status: "ACTIVE", counterpartyId: "cp2", counterpartyName: "Globex", value: 100 }),
      contract({ status: "DRAFT", counterpartyId: "cp3", counterpartyName: "Initech", value: 999 }), // not live
    ];
    const c = computeCounterpartyConcentration(rows);
    expect(c[0]).toEqual({ counterpartyId: "cp1", counterpartyName: "Acme", count: 2, liveValue: 400, share: 0.8 });
    expect(c[1]).toEqual({ counterpartyId: "cp2", counterpartyName: "Globex", count: 1, liveValue: 100, share: 0.2 });
    expect(c.find((x) => x.counterpartyName === "Initech")).toBeUndefined();
  });
  it("labels unassigned counterparties", () => {
    const c = computeCounterpartyConcentration([contract({ status: "ACTIVE", counterpartyId: null, value: 10 })]);
    expect(c[0]?.counterpartyName).toBe("— Unassigned —");
  });
});

describe("assembleContractAnalytics", () => {
  it("bundles every dimension with a generatedAt stamp", () => {
    const now = day("2026-06-01");
    const a = assembleContractAnalytics(
      [contract({ status: "ACTIVE", value: 100, risk: "HIGH", type: "MSA", expiryDate: day("2026-07-01"), autoRenew: true })],
      [{ status: "MET", dueDate: null }],
      [{ type: "Liability", deviation: true }],
      { now, renewalHorizonDays: 90 },
    );
    expect(a.generatedAt).toBe(now.toISOString());
    expect(a.totals.total).toBe(1);
    expect(a.byType[0]?.key).toBe("MSA");
    expect(a.renewalForecast.horizonDays).toBe(90);
    expect(a.renewalForecast.totalUpForRenewal).toBe(1);
    expect(a.obligationCompliance.complianceRate).toBe(1);
    expect(a.clauseDeviations[0]?.type).toBe("Liability");
  });
});
