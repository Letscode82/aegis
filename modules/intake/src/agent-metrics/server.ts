/**
 * Per-agent health metrics (Intake P2b hardening).
 *
 * Surfaces, per agent over a rolling window: how many recommendations
 * it produced, the attorney accept rate, average confidence, and the
 * degraded (Claude-unavailable fallback) rate. Lets ops spot a
 * misbehaving agent — "FAQ is 60% degraded" or "Vendor accept rate
 * dropped to 30%" — before customers complain.
 *
 * Pure read aggregation over AgentRecommendation (core stats; populated
 * by seed + runtime) and AgentDecision (degraded rate, when the P2b
 * lifecycle has written rows). Server-only.
 */
import { prisma } from "@aegis/db";

export interface AgentMetric {
  agentId: string;
  /** Recommendations produced in the window. */
  produced: number;
  approved: number; // APPROVED + EDITED
  rejected: number;
  pending: number;
  /** approved / (approved + rejected), or null if nothing reviewed. */
  acceptRate: number | null;
  /** Mean confidence across produced recommendations, or null. */
  avgConfidence: number | null;
  /** Share of AgentDecision rows that were degraded fallbacks (Claude
   * unavailable), or null if no decisions recorded for this agent. */
  degradedRate: number | null;
}

export interface AgentMetricsResult {
  windowDays: number;
  asOf: string;
  agents: AgentMetric[];
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export async function getAgentMetrics(
  organizationId: string,
  windowDays = 7,
  nowMs: number = Date.now(),
): Promise<AgentMetricsResult> {
  const since = new Date(nowMs - windowDays * 24 * 3600 * 1000);

  // Core stats from AgentRecommendation (org-scoped via the ticket).
  const recs = await prisma.agentRecommendation.findMany({
    where: { ticket: { organizationId }, createdAt: { gte: since } },
    select: { agentId: true, confidence: true, status: true },
  });

  // Degraded rate from AgentDecision (P2b lifecycle), org-scoped.
  const decisions = await prisma.agentDecision.findMany({
    where: {
      organizationId,
      resourceType: "IntakeTicket",
      createdAt: { gte: since },
    },
    select: { agentName: true, modelVersion: true },
  });

  type Acc = {
    produced: number;
    approved: number;
    rejected: number;
    pending: number;
    confSum: number;
    confN: number;
    decTotal: number;
    decDegraded: number;
  };
  const by = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = by.get(id);
    if (!a) {
      a = { produced: 0, approved: 0, rejected: 0, pending: 0, confSum: 0, confN: 0, decTotal: 0, decDegraded: 0 };
      by.set(id, a);
    }
    return a;
  };

  for (const r of recs) {
    const a = get(r.agentId);
    a.produced += 1;
    if (r.status === "APPROVED" || r.status === "EDITED") a.approved += 1;
    else if (r.status === "REJECTED") a.rejected += 1;
    else a.pending += 1;
    if (typeof r.confidence === "number") {
      a.confSum += r.confidence;
      a.confN += 1;
    }
  }
  for (const d of decisions) {
    const a = get(d.agentName);
    a.decTotal += 1;
    if (d.modelVersion === "degraded-fallback") a.decDegraded += 1;
  }

  const agents: AgentMetric[] = Array.from(by.entries())
    .map(([agentId, a]) => {
      const reviewed = a.approved + a.rejected;
      return {
        agentId,
        produced: a.produced,
        approved: a.approved,
        rejected: a.rejected,
        pending: a.pending,
        acceptRate: reviewed > 0 ? round(a.approved / reviewed) : null,
        avgConfidence: a.confN > 0 ? round(a.confSum / a.confN) : null,
        degradedRate: a.decTotal > 0 ? round(a.decDegraded / a.decTotal) : null,
      };
    })
    .sort((x, y) => y.produced - x.produced);

  return { windowDays, asOf: new Date(nowMs).toISOString(), agents };
}
