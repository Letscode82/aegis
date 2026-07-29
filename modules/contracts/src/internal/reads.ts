/**
 * Contract read aggregation (server-only — imports @aegis/db).
 *
 * getContractsOverview() is the repository dashboard's single round-trip:
 * every contract with its counterparty + matter labels, clause/obligation
 * counts, risk + lifecycle badges, and rolled-up totals (by status, by
 * risk, expiring soon). getContractDetail() is the drill-in: the contract
 * plus its extracted clauses and its obligations — the latter read from
 * the SHARED Obligation entity (sourceType = CONTRACT, sourceId =
 * contract.id), never a module-local table. Pure reads.
 */
import { prisma } from "@aegis/db";
import type { ContractStatus, ObligationStatus } from "@aegis/db";
import { daysToExpiry, obligationOverdue } from "./derive";
import { allowedContractTransitions } from "./contract-state-machine";
import { allowedObligationTransitions } from "./obligation-state-machine";
import { scoreContractClauses, type ClauseRiskScore } from "./risk-score";

export interface ContractClauseDTO {
  id: string;
  type: string;
  text: string;
  summary: string | null;
  risk: "LOW" | "MEDIUM" | "HIGH";
  deviation: boolean;
  createdAt: string;
}

export interface ContractObligationDTO {
  id: string;
  description: string;
  dueDate: string | null;
  recurrence: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: "OPEN" | "IN_PROGRESS" | "MET" | "BREACHED" | "WAIVED";
  overdue: boolean;
  createdAt: string;
}

export interface ContractSummary {
  id: string;
  title: string;
  type: string;
  status: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  value: number | null;
  currency: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  matterId: string | null;
  matterTitle: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  autoRenew: boolean;
  noticeWindowDays: number | null;
  governingLaw: string | null;
  clauseCount: number;
  deviationCount: number;
  /** Deterministic clause-derived risk score (Phase 3c) — 0-100 + band +
   *  drivers. `score` is null when there are no clauses to score. */
  riskScore: ClauseRiskScore;
  obligationCount: number;
  openObligationCount: number;
  overdueObligationCount: number;
  /** days until expiry (negative = expired); null when no expiry date. */
  daysToExpiry: number | null;
  createdAt: string;
}

export interface ContractDetail extends ContractSummary {
  sourceIntakeTicketId: string | null;
  /** Working draft body (Phase 4 authoring / negotiation); null for
   *  intake-spawned contracts. */
  draftText: string | null;
  clauses: ContractClauseDTO[];
  obligations: ContractObligationDTO[];
  // CLM lifecycle (Phase 1).
  statusChangedAt: string | null;
  executedAt: string | null;
  activatedAt: string | null;
  renewedAt: string | null;
  terminatedAt: string | null;
  /** The valid next states from the current status (state-machine driven) —
   *  the UI renders one advance button per entry. */
  allowedTransitions: ContractStatus[];
}

export interface ContractsOverview {
  totals: {
    total: number;
    active: number;
    inFlight: number; // DRAFT | IN_REVIEW | IN_NEGOTIATION | APPROVED
    highRisk: number;
    expiringSoon: number; // active/executed with expiry within 90 days
    totalValue: number;
    openObligations: number;
    overdueObligations: number;
  };
  byStatus: Record<string, number>;
  byRisk: Record<string, number>;
  contracts: ContractSummary[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const IN_FLIGHT = new Set(["DRAFT", "IN_REVIEW", "IN_NEGOTIATION", "APPROVED"]);
const LIVE = new Set(["ACTIVE", "EXECUTED"]);

/**
 * Build the obligation index for a set of contracts in a single query.
 * Obligations are the shared entity — one `findMany` scoped to
 * sourceType=CONTRACT covers every contract on the page.
 */
async function loadObligationsByContract(organizationId: string, contractIds: string[], now: Date) {
  const byContract: Record<string, ContractObligationDTO[]> = {};
  if (contractIds.length === 0) return byContract;

  const obligations = await prisma.obligation.findMany({
    where: { organizationId, sourceType: "CONTRACT", sourceId: { in: contractIds } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const ownerIds = Array.from(new Set(obligations.map((o) => o.ownerId).filter((x): x is string => !!x)));
  const owners = ownerIds.length
    ? await prisma.person.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : [];
  const ownerName: Record<string, string> = Object.fromEntries(owners.map((p) => [p.id, p.name]));

  for (const o of obligations) {
    const overdue = obligationOverdue(o.dueDate, o.status, now);
    (byContract[o.sourceId] ||= []).push({
      id: o.id,
      description: o.description,
      dueDate: o.dueDate ? o.dueDate.toISOString() : null,
      recurrence: o.recurrence,
      ownerId: o.ownerId,
      ownerName: o.ownerId ? ownerName[o.ownerId] || null : null,
      status: o.status,
      overdue,
      createdAt: o.createdAt.toISOString(),
    });
  }
  return byContract;
}

// ── Cross-contract obligation queue (CLM Phase 2) ────────────────────
// The portfolio-wide obligation ledger — every contract commitment in one
// list, by owner / due / status / overdue. Backs the Obligations dashboard.

export interface ObligationRow {
  id: string;
  contractId: string;
  contractTitle: string;
  description: string;
  dueDate: string | null;
  /** Days until due; negative = overdue; null if no due date. */
  daysToDue: number | null;
  recurrence: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: ObligationStatus;
  overdue: boolean;
  allowedTransitions: ObligationStatus[];
  createdAt: string;
}

export interface ObligationQueue {
  rows: ObligationRow[];
  totals: { total: number; open: number; overdue: number; dueSoon: number; met: number };
}

export interface ObligationFilter {
  status?: ObligationStatus;
  ownerId?: string;
  overdueOnly?: boolean;
  dueWithinDays?: number;
}

export async function listObligations(
  organizationId: string,
  filter?: ObligationFilter,
): Promise<ObligationQueue> {
  const now = new Date();
  const day = 86_400_000;
  const obligations = await prisma.obligation.findMany({
    where: {
      organizationId,
      sourceType: "CONTRACT",
      ...(filter?.status ? { status: filter.status } : {}),
      ...(filter?.ownerId ? { ownerId: filter.ownerId } : {}),
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
  });

  const contractIds = Array.from(new Set(obligations.map((o) => o.sourceId)));
  const contracts = contractIds.length
    ? await prisma.contract.findMany({ where: { id: { in: contractIds }, organizationId }, select: { id: true, title: true } })
    : [];
  const title: Record<string, string> = Object.fromEntries(contracts.map((c) => [c.id, c.title]));
  const ownerIds = Array.from(new Set(obligations.map((o) => o.ownerId).filter((x): x is string => !!x)));
  const owners = ownerIds.length
    ? await prisma.person.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true } })
    : [];
  const ownerName: Record<string, string> = Object.fromEntries(owners.map((p) => [p.id, p.name]));

  let rows: ObligationRow[] = obligations.map((o) => {
    const daysToDue = o.dueDate ? Math.floor((new Date(o.dueDate).getTime() - now.getTime()) / day) : null;
    return {
      id: o.id,
      contractId: o.sourceId,
      contractTitle: title[o.sourceId] || "—",
      description: o.description,
      dueDate: o.dueDate ? o.dueDate.toISOString() : null,
      daysToDue,
      recurrence: o.recurrence,
      ownerId: o.ownerId,
      ownerName: o.ownerId ? ownerName[o.ownerId] || null : null,
      status: o.status,
      overdue: obligationOverdue(o.dueDate, o.status, now),
      allowedTransitions: allowedObligationTransitions(o.status),
      createdAt: o.createdAt.toISOString(),
    };
  });
  if (filter?.overdueOnly) rows = rows.filter((r) => r.overdue);
  if (filter?.dueWithinDays != null) {
    const d = filter.dueWithinDays;
    rows = rows.filter((r) => r.daysToDue != null && r.daysToDue >= 0 && r.daysToDue <= d);
  }

  const openish = (s: ObligationStatus) => s === "OPEN" || s === "IN_PROGRESS";
  const totals = {
    total: rows.length,
    open: rows.filter((r) => openish(r.status)).length,
    overdue: rows.filter((r) => r.overdue).length,
    dueSoon: rows.filter((r) => openish(r.status) && r.daysToDue != null && r.daysToDue >= 0 && r.daysToDue <= 30).length,
    met: rows.filter((r) => r.status === "MET").length,
  };
  return { rows, totals };
}

function toSummary(
  c: Awaited<ReturnType<typeof prisma.contract.findMany>>[number] & {
    counterparty?: { name: string } | null;
    matter?: { title: string } | null;
    _count?: { clauses: number };
  },
  clauses: { type: string; risk: string; deviation: boolean }[] | null,
  obligations: ContractObligationDTO[],
  now: Date,
): ContractSummary {
  const deviationCount = clauses ? clauses.filter((cl) => cl.deviation).length : 0;
  const riskScore = scoreContractClauses(
    (clauses ?? []).map((cl) => ({ type: cl.type, risk: cl.risk as "LOW" | "MEDIUM" | "HIGH", deviation: cl.deviation })),
  );
  const openObligations = obligations.filter((o) => o.status === "OPEN" || o.status === "IN_PROGRESS");
  return {
    id: c.id,
    title: c.title,
    type: c.type,
    status: c.status,
    risk: c.risk,
    value: c.value == null ? null : round2(c.value),
    currency: c.currency,
    counterpartyId: c.counterpartyId,
    counterpartyName: c.counterparty?.name ?? null,
    matterId: c.matterId,
    matterTitle: c.matter?.title ?? null,
    effectiveDate: c.effectiveDate ? c.effectiveDate.toISOString() : null,
    expiryDate: c.expiryDate ? c.expiryDate.toISOString() : null,
    autoRenew: c.autoRenew,
    noticeWindowDays: c.noticeWindowDays,
    governingLaw: c.governingLaw,
    clauseCount: c._count?.clauses ?? (clauses ? clauses.length : 0),
    deviationCount,
    riskScore,
    obligationCount: obligations.length,
    openObligationCount: openObligations.length,
    overdueObligationCount: obligations.filter((o) => o.overdue).length,
    daysToExpiry: daysToExpiry(now, c.expiryDate),
    createdAt: c.createdAt.toISOString(),
  };
}

export interface CounterpartyOption {
  id: string;
  name: string;
  type: string | null;
}

/** Counterparties for the authoring picker (Phase 4a). Lightweight read. */
export async function listCounterpartiesForPicker(organizationId: string): Promise<CounterpartyOption[]> {
  const rows = await prisma.counterparty.findMany({
    where: { organizationId },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, type: (r.type as string | null) ?? null }));
}

export async function getContractsOverview(organizationId: string): Promise<ContractsOverview> {
  const now = new Date();
  const contracts = await prisma.contract.findMany({
    where: { organizationId },
    include: {
      counterparty: { select: { name: true } },
      matter: { select: { title: true } },
      clauses: { select: { type: true, risk: true, deviation: true } },
      _count: { select: { clauses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const obligationsByContract = await loadObligationsByContract(
    organizationId,
    contracts.map((c) => c.id),
    now,
  );

  const byStatus: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  let totalValue = 0;
  let openObligations = 0;
  let overdueObligations = 0;
  let expiringSoon = 0;
  let highRisk = 0;
  let active = 0;
  let inFlight = 0;

  const summaries: ContractSummary[] = contracts.map((c) => {
    const obl = obligationsByContract[c.id] || [];
    const s = toSummary(c, c.clauses, obl, now);
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    byRisk[c.risk] = (byRisk[c.risk] || 0) + 1;
    if (c.value) totalValue = round2(totalValue + c.value);
    openObligations += s.openObligationCount;
    overdueObligations += s.overdueObligationCount;
    if (c.risk === "HIGH") highRisk++;
    if (LIVE.has(c.status)) active++;
    if (IN_FLIGHT.has(c.status)) inFlight++;
    if (LIVE.has(c.status) && s.daysToExpiry != null && s.daysToExpiry >= 0 && s.daysToExpiry <= 90) expiringSoon++;
    return s;
  });

  return {
    totals: {
      total: contracts.length,
      active,
      inFlight,
      highRisk,
      expiringSoon,
      totalValue,
      openObligations,
      overdueObligations,
    },
    byStatus,
    byRisk,
    contracts: summaries,
  };
}

export async function getContractDetail(organizationId: string, contractId: string): Promise<ContractDetail | null> {
  const now = new Date();
  const c = await prisma.contract.findFirst({
    where: { id: contractId, organizationId },
    include: {
      counterparty: { select: { name: true } },
      matter: { select: { title: true } },
      clauses: { orderBy: [{ deviation: "desc" }, { createdAt: "asc" }] },
    },
  });
  if (!c) return null;

  const obligationsByContract = await loadObligationsByContract(organizationId, [c.id], now);
  const obligations = obligationsByContract[c.id] || [];

  const clauseDTOs: ContractClauseDTO[] = c.clauses.map((cl) => ({
    id: cl.id,
    type: cl.type,
    text: cl.text,
    summary: cl.summary,
    risk: cl.risk,
    deviation: cl.deviation,
    createdAt: cl.createdAt.toISOString(),
  }));

  const summary = toSummary(
    { ...c, _count: { clauses: c.clauses.length } },
    c.clauses.map((cl) => ({ type: cl.type, risk: cl.risk, deviation: cl.deviation })),
    obligations,
    now,
  );

  return {
    ...summary,
    sourceIntakeTicketId: c.sourceIntakeTicketId,
    draftText: c.draftText ?? null,
    clauses: clauseDTOs,
    obligations,
    statusChangedAt: c.statusChangedAt ? c.statusChangedAt.toISOString() : null,
    executedAt: c.executedAt ? c.executedAt.toISOString() : null,
    activatedAt: c.activatedAt ? c.activatedAt.toISOString() : null,
    renewedAt: c.renewedAt ? c.renewedAt.toISOString() : null,
    terminatedAt: c.terminatedAt ? c.terminatedAt.toISOString() : null,
    allowedTransitions: allowedContractTransitions(c.status),
  };
}
