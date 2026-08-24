/**
 * ECA-3 — Early Case Assessment. "How big is this, what's it about, and what
 * will it cost — before we pay to review it." A pure read-aggregation over the
 * existing ReviewSetItem data: no schema change, no mutation.
 *
 * The volume funnel walks Collected → After dedup → After threading → In scope,
 * shows what culling removed, estimates review cost/time on the surviving set,
 * and breaks the set down by source, AI route, and issue. The output is a
 * defensible ECA snapshot the GC uses to scope (and to justify) the review.
 */
import { prisma } from "@aegis/db";

export interface EcaFunnelStage { key: string; label: string; count: number; pctOfCollected: number }
export interface EcaBreakdownRow { key: string; count: number }
export interface EcaCostModel { perDocMinutes: number; hourlyRate: number; currency: string }
export interface EcaEstimate {
  reviewDocs: number;
  hours: number;
  cost: number;
  culledDocs: number;
  hoursSaved: number;
  costSaved: number;
}
export interface EcaFunnel {
  reviewSetId: string;
  collected: number;
  funnel: EcaFunnelStage[];
  excluded: number;
  excludedByReason: EcaBreakdownRow[];
  coded: number;
  responsive: number;
  privileged: number;
  bySource: EcaBreakdownRow[];
  byRoute: EcaBreakdownRow[];
  byIssue: EcaBreakdownRow[];
  cost: EcaCostModel;
  estimate: EcaEstimate;
}

const DEFAULT_COST: EcaCostModel = { perDocMinutes: 2, hourlyRate: 75, currency: "USD" };

/**
 * Resolve the cost model from a partial override, ignoring undefined/invalid
 * fields (a spread would let `undefined` clobber the defaults and produce NaN).
 * Pure + unit-tested.
 */
export function resolveCostModel(cost: Partial<EcaCostModel> = {}): EcaCostModel {
  const posNum = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
  return {
    perDocMinutes: posNum(cost.perDocMinutes, DEFAULT_COST.perDocMinutes),
    hourlyRate: posNum(cost.hourlyRate, DEFAULT_COST.hourlyRate),
    currency: typeof cost.currency === "string" && cost.currency ? cost.currency : DEFAULT_COST.currency,
  };
}

function pct(n: number, of: number): number {
  return of > 0 ? Math.round((n / of) * 1000) / 10 : 0;
}
function tally(rows: Array<{ key: string | null }>): EcaBreakdownRow[] {
  const m = new Map<string, number>();
  for (const r of rows) { const k = r.key ?? "—"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export async function getEcaFunnel(organizationId: string, reviewSetId: string, cost: Partial<EcaCostModel> = {}): Promise<EcaFunnel> {
  const rs = await prisma.reviewSet.findFirst({ where: { id: reviewSetId, organizationId }, select: { id: true } });
  if (!rs) throw new Error("Review set not found");

  const items = await prisma.reviewSetItem.findMany({
    where: { reviewSetId },
    select: {
      sourceSystem: true, aiRoute: true, aiVerdict: true, codingJson: true,
      isInclusive: true, dedupKey: true, excludedAt: true, exclusionReason: true,
      reviewDecision: true, codedResponsive: true, codedPrivileged: true,
    },
  });

  const collected = items.length;

  // After dedup: drop items that are a repeat of a dedupKey already seen.
  const seenDedup = new Set<string>();
  let dupCount = 0;
  for (const it of items) {
    if (it.dedupKey) { if (seenDedup.has(it.dedupKey)) { dupCount += 1; continue; } seenDedup.add(it.dedupKey); }
  }
  const afterDedup = collected - dupCount;

  // After threading: also drop non-inclusive (superseded) thread members.
  const nonInclusive = items.filter((it) => it.isInclusive === false).length;
  const afterThreading = Math.max(0, afterDedup - nonInclusive);

  // Live set = not excluded (culled). In scope = live AND responsive (AI or coded).
  const live = items.filter((it) => it.excludedAt == null);
  const inScope = live.filter((it) => it.codedResponsive === true || it.aiVerdict === "RELEVANT").length;

  const excluded = items.filter((it) => it.excludedAt != null).length;
  const coded = items.filter((it) => it.reviewDecision !== "PENDING").length;
  const responsive = items.filter((it) => it.codedResponsive === true).length;
  const privileged = items.filter((it) => it.codedPrivileged === true).length;

  const funnel: EcaFunnelStage[] = [
    { key: "collected", label: "Collected", count: collected, pctOfCollected: 100 },
    { key: "afterDedup", label: "After dedup", count: afterDedup, pctOfCollected: pct(afterDedup, collected) },
    { key: "afterThreading", label: "After threading", count: afterThreading, pctOfCollected: pct(afterThreading, collected) },
    { key: "inScope", label: "In scope", count: inScope, pctOfCollected: pct(inScope, collected) },
  ];

  const byIssueRows: Array<{ key: string | null }> = [];
  for (const it of live) {
    const issues = (it.codingJson as { issues?: string[] } | null)?.issues ?? [];
    if (issues.length === 0) byIssueRows.push({ key: null });
    else for (const iss of issues) byIssueRows.push({ key: iss });
  }

  const model: EcaCostModel = resolveCostModel(cost);
  // Reviewable set = everything still live after culling (what a human/AI must look at).
  const reviewDocs = live.length;
  const culledDocs = excluded;
  const hours = Math.round((reviewDocs * model.perDocMinutes / 60) * 10) / 10;
  const hoursSaved = Math.round((culledDocs * model.perDocMinutes / 60) * 10) / 10;
  const estimate: EcaEstimate = {
    reviewDocs, hours, cost: Math.round(hours * model.hourlyRate),
    culledDocs, hoursSaved, costSaved: Math.round(hoursSaved * model.hourlyRate),
  };

  return {
    reviewSetId, collected, funnel, excluded,
    excludedByReason: tally(items.filter((it) => it.excludedAt != null).map((it) => ({ key: it.exclusionReason }))),
    coded, responsive, privileged,
    bySource: tally(items.map((it) => ({ key: it.sourceSystem }))),
    byRoute: tally(live.map((it) => ({ key: it.aiRoute }))),
    byIssue: tally(byIssueRows),
    cost: model, estimate,
  };
}
