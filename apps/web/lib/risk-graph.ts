/**
 * Risk Graph aggregation (apps/web composition root).
 *
 * A cross-module read over the SHARED entities — Counterparty, Matter,
 * Contract (+ ContractClause), Obligation, LegalHold — to build a real
 * relationship graph with deterministic risk scoring. This lives in the
 * app (not a module) because it spans domains that no single module
 * owns; per the isolation rule, cross-cutting reads of shared entities
 * go through `@aegis/db`, never a module's internals.
 *
 * Nodes: counterparties (that are actually connected), matters,
 * contracts, and active legal holds — each carrying a 0–100 riskScore,
 * a severity band, and the concrete flags that produced it. Edges are
 * the real foreign keys (contract↔counterparty, contract↔matter,
 * matter↔counterparty, hold↔matter). Insights are real aggregations,
 * not the three hardcoded cards the old mock showed.
 */
import { prisma } from "@aegis/db";

export type RiskSeverity = "low" | "medium" | "high";
export type RiskNodeType = "counterparty" | "matter" | "contract" | "hold";

export interface RiskNode {
  id: string;
  type: RiskNodeType;
  label: string;
  sub: string | null;
  riskScore: number;
  severity: RiskSeverity;
  flags: string[];
  x: number;
  y: number;
  r: number;
}

export interface RiskEdge {
  source: string;
  target: string;
  kind: string;
}

export interface RiskInsight {
  severity: RiskSeverity;
  text: string;
}

export interface RiskGraph {
  nodes: RiskNode[];
  edges: RiskEdge[];
  insights: RiskInsight[];
  stats: {
    nodes: number;
    highRiskContracts: number;
    overdueObligations: number;
    mattersUnderHold: number;
    unscreenedCounterparties: number;
    autoRenewTraps: number;
  };
  generatedAt: string;
}

// Illustrative sanctions/high-risk jurisdictions for the screening-gap
// signal. Deliberately conservative — the primary signal is a null
// `sanctionsScreenedAt`, this just escalates known-sensitive countries.
const HIGH_RISK_COUNTRIES = new Set(["RU", "IR", "KP", "SY", "CU", "BY", "VE"]);

const severityOf = (score: number): RiskSeverity => (score >= 60 ? "high" : score >= 30 ? "medium" : "low");
const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function getRiskGraph(organizationId: string): Promise<RiskGraph> {
  const now = new Date();
  const [counterparties, matters, contracts, clauses, obligations, holds] = await Promise.all([
    prisma.counterparty.findMany({ where: { organizationId }, select: { id: true, name: true, country: true, sanctionsScreenedAt: true } }),
    prisma.matter.findMany({ where: { organizationId }, select: { id: true, title: true, status: true, counterpartyId: true } }),
    prisma.contract.findMany({
      where: { organizationId },
      select: { id: true, title: true, status: true, risk: true, counterpartyId: true, matterId: true, expiryDate: true, autoRenew: true, noticeWindowDays: true },
    }),
    prisma.contractClause.findMany({
      where: { contract: { organizationId } },
      select: { contractId: true, risk: true, deviation: true },
    }),
    prisma.obligation.findMany({
      where: { organizationId, sourceType: "CONTRACT" },
      select: { sourceId: true, status: true, dueDate: true },
    }),
    prisma.legalHold.findMany({ where: { organizationId }, select: { id: true, title: true, status: true, matterId: true } }),
  ]);

  // ── Per-contract clause + obligation rollups ──────────────────────
  const clauseAgg: Record<string, { high: number; deviation: number }> = {};
  for (const c of clauses) {
    const a = (clauseAgg[c.contractId] ||= { high: 0, deviation: 0 });
    if (c.risk === "HIGH") a.high++;
    if (c.deviation) a.deviation++;
  }
  const overdueByContract: Record<string, number> = {};
  let overdueObligations = 0;
  for (const o of obligations) {
    const overdue = !!o.dueDate && o.dueDate < now && (o.status === "OPEN" || o.status === "IN_PROGRESS");
    if (overdue) {
      overdueByContract[o.sourceId] = (overdueByContract[o.sourceId] || 0) + 1;
      overdueObligations++;
    }
  }
  const activeHoldByMatter: Record<string, { id: string; name: string }> = {};
  for (const h of holds) {
    if (h.matterId && h.status !== "RELEASED") activeHoldByMatter[h.matterId] = { id: h.id, name: h.title };
  }

  const nodes: RiskNode[] = [];
  const edges: RiskEdge[] = [];
  const connectedCounterparties = new Set<string>();

  // ── Contract nodes ────────────────────────────────────────────────
  let highRiskContracts = 0;
  let autoRenewTraps = 0;
  for (const c of contracts) {
    const agg = clauseAgg[c.id] || { high: 0, deviation: 0 };
    const overdue = overdueByContract[c.id] || 0;
    const flags: string[] = [];
    let score = 0;
    if (c.risk === "HIGH") { score += 40; flags.push("High-risk contract"); }
    else if (c.risk === "MEDIUM") score += 15;
    if (agg.high > 0) { score += Math.min(30, agg.high * 15); flags.push(`${agg.high} high-risk clause${agg.high === 1 ? "" : "s"}`); }
    if (agg.deviation > 0) { score += Math.min(20, agg.deviation * 10); flags.push(`${agg.deviation} off-playbook clause${agg.deviation === 1 ? "" : "s"}`); }
    if (overdue > 0) { score += Math.min(30, overdue * 15); flags.push(`${overdue} overdue obligation${overdue === 1 ? "" : "s"}`); }
    const expired = !!c.expiryDate && c.expiryDate < now;
    const daysToExpiry = c.expiryDate ? Math.round((c.expiryDate.getTime() - now.getTime()) / 86_400_000) : null;
    if (expired && c.status !== "EXPIRED" && c.status !== "TERMINATED") { score += 25; flags.push("Past expiry, still active"); }
    if (c.autoRenew && daysToExpiry != null && daysToExpiry >= 0 && c.noticeWindowDays != null && daysToExpiry <= c.noticeWindowDays) {
      score += 25; flags.push("Auto-renew trap (inside notice window)"); autoRenewTraps++;
    }
    if (c.risk === "HIGH" || agg.high > 0 || agg.deviation > 0) highRiskContracts++;
    score = clampScore(score);
    nodes.push({ id: `contract:${c.id}`, type: "contract", label: c.title, sub: c.status.replace(/_/g, " "), riskScore: score, severity: severityOf(score), flags, x: 0, y: 0, r: 0 });

    if (c.counterpartyId) { edges.push({ source: `contract:${c.id}`, target: `counterparty:${c.counterpartyId}`, kind: "party" }); connectedCounterparties.add(c.counterpartyId); }
    if (c.matterId) edges.push({ source: `contract:${c.id}`, target: `matter:${c.matterId}`, kind: "under" });
  }

  // ── Matter nodes ──────────────────────────────────────────────────
  let mattersUnderHold = 0;
  for (const m of matters) {
    const hold = activeHoldByMatter[m.id];
    const flags: string[] = [];
    let score = 0;
    if (hold) { score += 30; flags.push("Under active legal hold"); mattersUnderHold++; }
    // Matters inherit signal from their high-risk contracts.
    const linkedHighRisk = contracts.filter((c) => c.matterId === m.id && (c.risk === "HIGH" || (clauseAgg[c.id]?.high || 0) > 0)).length;
    if (linkedHighRisk > 0) { score += Math.min(25, linkedHighRisk * 15); flags.push(`${linkedHighRisk} high-risk contract${linkedHighRisk === 1 ? "" : "s"}`); }
    score = clampScore(score);
    nodes.push({ id: `matter:${m.id}`, type: "matter", label: m.title, sub: m.status, riskScore: score, severity: severityOf(score), flags, x: 0, y: 0, r: 0 });
    if (m.counterpartyId) { edges.push({ source: `matter:${m.id}`, target: `counterparty:${m.counterpartyId}`, kind: "counterparty" }); connectedCounterparties.add(m.counterpartyId); }
    if (hold) {
      nodes.push({ id: `hold:${hold.id}`, type: "hold", label: hold.name, sub: "active preservation", riskScore: 45, severity: "medium", flags: ["Active legal hold"], x: 0, y: 0, r: 0 });
      edges.push({ source: `hold:${hold.id}`, target: `matter:${m.id}`, kind: "preserves" });
    }
  }

  // ── Counterparty nodes (only those actually connected) ────────────
  let unscreenedCounterparties = 0;
  for (const cp of counterparties) {
    if (!connectedCounterparties.has(cp.id)) continue;
    const flags: string[] = [];
    let score = 0;
    if (!cp.sanctionsScreenedAt) { score += 30; flags.push("Never sanctions-screened"); unscreenedCounterparties++; }
    if (cp.country && HIGH_RISK_COUNTRIES.has(cp.country)) { score += 25; flags.push(`High-risk jurisdiction (${cp.country})`); }
    score = clampScore(score);
    nodes.push({ id: `counterparty:${cp.id}`, type: "counterparty", label: cp.name, sub: cp.country || null, riskScore: score, severity: severityOf(score), flags, x: 0, y: 0, r: 0 });
  }

  // Drop edges whose endpoints didn't make it into the node set.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const liveEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  layout(nodes);

  const insights = buildInsights({ highRiskContracts, overdueObligations, mattersUnderHold, unscreenedCounterparties, autoRenewTraps, nodes });

  return {
    nodes,
    edges: liveEdges,
    insights,
    stats: {
      nodes: nodes.length,
      highRiskContracts,
      overdueObligations,
      mattersUnderHold,
      unscreenedCounterparties,
      autoRenewTraps,
    },
    generatedAt: now.toISOString(),
  };
}

/**
 * Layered layout in the SVG's 0–100 space: counterparties left, matters
 * center-left, contracts center-right, holds right; evenly distributed
 * vertically within each column. Radius scales with severity. Keeps the
 * existing SVG renderer — no force-graph dependency.
 */
function layout(nodes: RiskNode[]) {
  const columns: Record<RiskNodeType, number> = { counterparty: 12, matter: 40, contract: 68, hold: 90 };
  const rBySeverity: Record<RiskSeverity, number> = { high: 3.4, medium: 2.7, low: 2.1 };
  const byType: Record<RiskNodeType, RiskNode[]> = { counterparty: [], matter: [], contract: [], hold: [] };
  for (const n of nodes) byType[n.type].push(n);
  for (const type of Object.keys(byType) as RiskNodeType[]) {
    const col = byType[type];
    const n = col.length;
    col.forEach((node, i) => {
      node.x = columns[type];
      node.y = n === 1 ? 50 : 10 + (80 * i) / (n - 1);
      node.r = rBySeverity[node.severity];
    });
  }
}

function buildInsights(input: {
  highRiskContracts: number;
  overdueObligations: number;
  mattersUnderHold: number;
  unscreenedCounterparties: number;
  autoRenewTraps: number;
  nodes: RiskNode[];
}): RiskInsight[] {
  const out: RiskInsight[] = [];
  if (input.highRiskContracts > 0) out.push({ severity: "high", text: `${input.highRiskContracts} contract${input.highRiskContracts === 1 ? "" : "s"} are high-risk or carry off-playbook clauses.` });
  if (input.overdueObligations > 0) out.push({ severity: "high", text: `${input.overdueObligations} contract obligation${input.overdueObligations === 1 ? " is" : "s are"} overdue.` });
  if (input.autoRenewTraps > 0) out.push({ severity: "medium", text: `${input.autoRenewTraps} contract${input.autoRenewTraps === 1 ? "" : "s"} auto-renew inside the notice window — act before they lock in.` });
  if (input.mattersUnderHold > 0) out.push({ severity: "medium", text: `${input.mattersUnderHold} matter${input.mattersUnderHold === 1 ? " is" : "s are"} under an active legal hold.` });
  if (input.unscreenedCounterparties > 0) out.push({ severity: "medium", text: `${input.unscreenedCounterparties} connected counterpart${input.unscreenedCounterparties === 1 ? "y has" : "ies have"} never been sanctions-screened.` });
  const top = [...input.nodes].sort((a, b) => b.riskScore - a.riskScore)[0];
  if (top && top.riskScore >= 30) out.push({ severity: top.severity, text: `Highest exposure: ${top.label} (${top.riskScore}/100) — ${top.flags[0] || "elevated risk"}.` });
  if (out.length === 0) out.push({ severity: "low", text: "No elevated risk signals across contracts, matters, holds, or counterparties right now." });
  return out;
}
