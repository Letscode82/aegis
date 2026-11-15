/**
 * Contract portfolio analytics (CLM Phase 10 — the GC's analytics surface).
 *
 * Read-only aggregation over the contracts the org already has: no new tables,
 * no mutation, no AI. The heavy lifting is a set of PURE functions over plain
 * row arrays (unit-tested, deterministic), wrapped by one service that does a
 * handful of scalar-only Prisma reads. The dashboard renders the result in a
 * single round-trip.
 *
 * Dimensions:
 *   - Portfolio totals & value (total / live / in-flight, total & live value).
 *   - Distribution by status, risk band, and contract type (count + value).
 *   - Cycle time: intake→executed days (avg/median) + in-flight aging.
 *   - Value-at-risk: live contract value exposed at each risk band.
 *   - Renewal forecast: contracts expiring within a horizon, bucketed by month,
 *     with value and auto-renew split — the "$ up for renewal" view.
 *   - Obligation compliance: met / breached / overdue → a compliance rate.
 *   - Clause-deviation frequency: which clause types deviate from our paper
 *     most often across the portfolio.
 *   - Counterparty concentration: top counterparties by live value & share.
 */
import { prisma } from "@aegis/db";
import type { ContractStatus, ObligationStatus } from "@aegis/db";

export type AnalyticsRiskLevel = "LOW" | "MEDIUM" | "HIGH";

/** Minimal contract shape the pure aggregators need. */
export interface AnalyticsContractRow {
  id: string;
  type: string;
  status: ContractStatus;
  risk: AnalyticsRiskLevel;
  value: number | null;
  currency: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  autoRenew: boolean;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  createdAt: Date;
  executedAt: Date | null;
}
export interface AnalyticsObligationRow {
  status: ObligationStatus;
  dueDate: Date | null;
}
export interface AnalyticsClauseRow {
  type: string;
  deviation: boolean;
}

const LIVE: ReadonlySet<string> = new Set(["ACTIVE", "EXECUTED"]);
const IN_FLIGHT: ReadonlySet<string> = new Set(["DRAFT", "IN_REVIEW", "IN_NEGOTIATION", "APPROVED"]);
const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86_400_000;

// ── Distribution helpers ─────────────────────────────────────────────
export interface DistributionBucket {
  key: string;
  count: number;
  value: number;
}
/** Count + summed value grouped by an arbitrary key extractor, desc by count. */
export function distributionBy(
  rows: AnalyticsContractRow[],
  keyOf: (r: AnalyticsContractRow) => string,
): DistributionBucket[] {
  const map = new Map<string, DistributionBucket>();
  for (const r of rows) {
    const key = keyOf(r);
    const b = map.get(key) || { key, count: 0, value: 0 };
    b.count += 1;
    b.value = round2(b.value + (r.value || 0));
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.value - a.value);
}

// ── Portfolio totals ─────────────────────────────────────────────────
export interface PortfolioTotals {
  total: number;
  live: number;
  inFlight: number;
  totalValue: number;
  liveValue: number;
  /** live contract value sitting in HIGH-risk paper */
  highRiskLiveValue: number;
  currency: string;
}
export function computePortfolioTotals(rows: AnalyticsContractRow[]): PortfolioTotals {
  let totalValue = 0, liveValue = 0, highRiskLiveValue = 0, live = 0, inFlight = 0;
  const currencies = new Map<string, number>();
  for (const r of rows) {
    const v = r.value || 0;
    totalValue += v;
    if (r.value != null) currencies.set(r.currency, (currencies.get(r.currency) || 0) + 1);
    if (LIVE.has(r.status)) {
      live += 1;
      liveValue += v;
      if (r.risk === "HIGH") highRiskLiveValue += v;
    } else if (IN_FLIGHT.has(r.status)) {
      inFlight += 1;
    }
  }
  // Majority currency wins the header label; mixed portfolios still sum
  // numerically (the UI notes when currencies are mixed).
  let currency = "USD";
  let best = -1;
  for (const [c, n] of currencies) if (n > best) { best = n; currency = c; }
  return {
    total: rows.length,
    live,
    inFlight,
    totalValue: round2(totalValue),
    liveValue: round2(liveValue),
    highRiskLiveValue: round2(highRiskLiveValue),
    currency,
  };
}

// ── Cycle time (intake → executed) ───────────────────────────────────
export interface CycleTimeStats {
  executedCount: number;
  avgDays: number | null;
  medianDays: number | null;
  fastestDays: number | null;
  slowestDays: number | null;
  /** oldest still-in-flight contract age, days */
  oldestInFlightDays: number | null;
  inFlightCount: number;
}
export function computeCycleTime(rows: AnalyticsContractRow[], now: Date = new Date()): CycleTimeStats {
  const durations: number[] = [];
  for (const r of rows) {
    if (r.executedAt && r.createdAt) {
      const d = Math.round((r.executedAt.getTime() - r.createdAt.getTime()) / DAY_MS);
      if (d >= 0) durations.push(d);
    }
  }
  durations.sort((a, b) => a - b);
  let oldestInFlightDays: number | null = null;
  let inFlightCount = 0;
  for (const r of rows) {
    if (IN_FLIGHT.has(r.status)) {
      inFlightCount += 1;
      const age = Math.round((now.getTime() - r.createdAt.getTime()) / DAY_MS);
      if (oldestInFlightDays == null || age > oldestInFlightDays) oldestInFlightDays = age;
    }
  }
  const n = durations.length;
  let median: number | null = null;
  if (n > 0) {
    if (n % 2 === 1) median = durations[(n - 1) / 2] ?? null;
    else median = Math.round(((durations[n / 2 - 1] ?? 0) + (durations[n / 2] ?? 0)) / 2);
  }
  return {
    executedCount: n,
    avgDays: n === 0 ? null : Math.round(durations.reduce((s, d) => s + d, 0) / n),
    medianDays: median,
    fastestDays: n === 0 ? null : (durations[0] ?? null),
    slowestDays: n === 0 ? null : (durations[n - 1] ?? null),
    oldestInFlightDays,
    inFlightCount,
  };
}

// ── Value at risk (live contracts by risk band) ──────────────────────
export interface ValueAtRisk {
  band: AnalyticsRiskLevel;
  count: number;
  value: number;
}
export function computeValueAtRisk(rows: AnalyticsContractRow[]): ValueAtRisk[] {
  const order: AnalyticsRiskLevel[] = ["HIGH", "MEDIUM", "LOW"];
  const map = new Map<AnalyticsRiskLevel, ValueAtRisk>(order.map((b) => [b, { band: b, count: 0, value: 0 }]));
  for (const r of rows) {
    if (!LIVE.has(r.status)) continue;
    const e = map.get(r.risk);
    if (e) { e.count += 1; e.value = round2(e.value + (r.value || 0)); }
  }
  return order.map((b) => map.get(b)!);
}

// ── Renewal forecast ─────────────────────────────────────────────────
export interface RenewalBucket {
  month: string; // YYYY-MM
  count: number;
  value: number;
  autoRenewCount: number;
}
export interface RenewalForecast {
  horizonDays: number;
  totalUpForRenewal: number;
  valueUpForRenewal: number;
  autoRenewCount: number;
  manualCount: number;
  expiredUnresolved: number;
  buckets: RenewalBucket[];
}
/** Live contracts whose expiry falls within `horizonDays` of `now`, bucketed by
 *  expiry month. Expired-but-still-live contracts are surfaced separately. */
export function computeRenewalForecast(
  rows: AnalyticsContractRow[],
  now: Date = new Date(),
  horizonDays = 180,
): RenewalForecast {
  const horizonMs = horizonDays * DAY_MS;
  const buckets = new Map<string, RenewalBucket>();
  let totalUpForRenewal = 0, valueUpForRenewal = 0, autoRenewCount = 0, manualCount = 0, expiredUnresolved = 0;
  for (const r of rows) {
    if (!LIVE.has(r.status) || !r.expiryDate) continue;
    const delta = r.expiryDate.getTime() - now.getTime();
    if (delta < 0) { expiredUnresolved += 1; continue; }
    if (delta > horizonMs) continue;
    const month = `${r.expiryDate.getUTCFullYear()}-${String(r.expiryDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const b = buckets.get(month) || { month, count: 0, value: 0, autoRenewCount: 0 };
    b.count += 1;
    b.value = round2(b.value + (r.value || 0));
    if (r.autoRenew) b.autoRenewCount += 1;
    buckets.set(month, b);
    totalUpForRenewal += 1;
    valueUpForRenewal = round2(valueUpForRenewal + (r.value || 0));
    if (r.autoRenew) autoRenewCount += 1; else manualCount += 1;
  }
  return {
    horizonDays,
    totalUpForRenewal,
    valueUpForRenewal,
    autoRenewCount,
    manualCount,
    expiredUnresolved,
    buckets: [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// ── Obligation compliance ────────────────────────────────────────────
export interface ObligationCompliance {
  total: number;
  met: number;
  breached: number;
  overdueOpen: number;
  open: number;
  waived: number;
  /** met / (met + breached + overdueOpen); null when nothing is measurable */
  complianceRate: number | null;
}
export function computeObligationCompliance(
  rows: AnalyticsObligationRow[],
  now: Date = new Date(),
): ObligationCompliance {
  let met = 0, breached = 0, overdueOpen = 0, open = 0, waived = 0;
  for (const o of rows) {
    if (o.status === "MET") met += 1;
    else if (o.status === "BREACHED") breached += 1;
    else if (o.status === "WAIVED") waived += 1;
    else { // OPEN | IN_PROGRESS
      open += 1;
      if (o.dueDate && o.dueDate.getTime() < now.getTime()) overdueOpen += 1;
    }
  }
  const denom = met + breached + overdueOpen;
  return {
    total: rows.length,
    met, breached, overdueOpen, open, waived,
    complianceRate: denom === 0 ? null : round2(met / denom),
  };
}

// ── Clause-deviation frequency ───────────────────────────────────────
export interface ClauseDeviationStat {
  type: string;
  total: number;
  deviations: number;
  deviationRate: number; // 0–1
}
export function computeClauseDeviations(rows: AnalyticsClauseRow[]): ClauseDeviationStat[] {
  const map = new Map<string, { total: number; deviations: number }>();
  for (const c of rows) {
    const e = map.get(c.type) || { total: 0, deviations: 0 };
    e.total += 1;
    if (c.deviation) e.deviations += 1;
    map.set(c.type, e);
  }
  return [...map.entries()]
    .map(([type, e]) => ({ type, total: e.total, deviations: e.deviations, deviationRate: e.total === 0 ? 0 : round2(e.deviations / e.total) }))
    .sort((a, b) => b.deviationRate - a.deviationRate || b.deviations - a.deviations);
}

// ── Counterparty concentration ───────────────────────────────────────
export interface CounterpartyConcentration {
  counterpartyId: string | null;
  counterpartyName: string;
  count: number;
  liveValue: number;
  /** liveValue share of the whole portfolio's live value, 0–1 */
  share: number;
}
export function computeCounterpartyConcentration(
  rows: AnalyticsContractRow[],
  topN = 8,
): CounterpartyConcentration[] {
  const map = new Map<string, { id: string | null; name: string; count: number; liveValue: number }>();
  let totalLiveValue = 0;
  for (const r of rows) {
    if (!LIVE.has(r.status)) continue;
    const id = r.counterpartyId || "__none__";
    const e = map.get(id) || { id: r.counterpartyId, name: r.counterpartyName || "— Unassigned —", count: 0, liveValue: 0 };
    e.count += 1;
    e.liveValue = round2(e.liveValue + (r.value || 0));
    map.set(id, e);
    totalLiveValue += r.value || 0;
  }
  return [...map.values()]
    .sort((a, b) => b.liveValue - a.liveValue || b.count - a.count)
    .slice(0, topN)
    .map((e) => ({
      counterpartyId: e.id,
      counterpartyName: e.name,
      count: e.count,
      liveValue: e.liveValue,
      share: totalLiveValue === 0 ? 0 : round2(e.liveValue / totalLiveValue),
    }));
}

// ── The bundled analytics DTO ────────────────────────────────────────
export interface ContractAnalytics {
  generatedAt: string;
  totals: PortfolioTotals;
  byStatus: DistributionBucket[];
  byRisk: DistributionBucket[];
  byType: DistributionBucket[];
  cycleTime: CycleTimeStats;
  valueAtRisk: ValueAtRisk[];
  renewalForecast: RenewalForecast;
  obligationCompliance: ObligationCompliance;
  clauseDeviations: ClauseDeviationStat[];
  counterpartyConcentration: CounterpartyConcentration[];
}

/** Assemble the full analytics payload from in-memory rows. Pure. */
export function assembleContractAnalytics(
  contracts: AnalyticsContractRow[],
  obligations: AnalyticsObligationRow[],
  clauses: AnalyticsClauseRow[],
  opts: { now?: Date; renewalHorizonDays?: number } = {},
): ContractAnalytics {
  const now = opts.now ?? new Date();
  return {
    generatedAt: now.toISOString(),
    totals: computePortfolioTotals(contracts),
    byStatus: distributionBy(contracts, (r) => r.status),
    byRisk: distributionBy(contracts, (r) => r.risk),
    byType: distributionBy(contracts, (r) => r.type),
    cycleTime: computeCycleTime(contracts, now),
    valueAtRisk: computeValueAtRisk(contracts),
    renewalForecast: computeRenewalForecast(contracts, now, opts.renewalHorizonDays ?? 180),
    obligationCompliance: computeObligationCompliance(obligations, now),
    clauseDeviations: computeClauseDeviations(clauses),
    counterpartyConcentration: computeCounterpartyConcentration(contracts),
  };
}

/**
 * Service entry point — three scalar-only reads, then pure assembly. Scoped to
 * the org; reads the SHARED Obligation entity (sourceType=CONTRACT) and clause
 * rows via the contract relation. No mutation, no audit (read-only).
 */
export async function getContractAnalyticsService(
  organizationId: string,
  opts: { now?: Date; renewalHorizonDays?: number } = {},
): Promise<ContractAnalytics> {
  const [contracts, obligations, clauses] = await Promise.all([
    prisma.contract.findMany({
      where: { organizationId },
      select: {
        id: true, type: true, status: true, risk: true, value: true, currency: true,
        counterpartyId: true, autoRenew: true, effectiveDate: true, expiryDate: true,
        createdAt: true, executedAt: true,
        counterparty: { select: { name: true } },
      },
    }),
    prisma.obligation.findMany({
      where: { organizationId, sourceType: "CONTRACT" },
      select: { status: true, dueDate: true },
    }),
    prisma.contractClause.findMany({
      where: { contract: { organizationId } },
      select: { type: true, deviation: true },
    }),
  ]);
  const contractRows: AnalyticsContractRow[] = contracts.map((c) => ({
    id: c.id,
    type: c.type,
    status: c.status,
    risk: c.risk as AnalyticsRiskLevel,
    value: c.value,
    currency: c.currency,
    counterpartyId: c.counterpartyId,
    counterpartyName: c.counterparty?.name ?? null,
    autoRenew: c.autoRenew,
    effectiveDate: c.effectiveDate,
    expiryDate: c.expiryDate,
    createdAt: c.createdAt,
    executedAt: c.executedAt,
  }));
  return assembleContractAnalytics(contractRows, obligations, clauses, opts);
}
