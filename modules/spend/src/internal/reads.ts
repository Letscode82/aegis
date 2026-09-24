/**
 * Spend read aggregation (server-only — imports @aegis/db).
 *
 * getSpendOverview() is the GC dashboard's single round-trip: firms,
 * invoices (each scrubbed through the review engine so the dashboard can
 * show flag counts + the AI-proposed savings), budgets, and rolled-up
 * totals. Pure reads — no mutation, gated like the existing
 * /api/ai-ops route.
 */
import { prisma } from "@aegis/db";
import { runInvoiceReview, type ReviewContext, type ReviewLineItem } from "./review/rules";

export interface SpendFirmSummary {
  vendorId: string;
  name: string;
  type: string;
  counterpartyId: string | null;
  performanceScore: number | null;
  timekeeperCount: number;
  invoiceCount: number;
  totalBilled: number;
}

export interface SpendInvoiceSummary {
  id: string;
  vendorName: string;
  matterId: string;
  matterTitle: string;
  amount: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  lineCount: number;
  flagCount: number;
  deterministicFlagCount: number;
  judgmentFlagCount: number;
  /** AI-proposed short-pay from the deterministic rules (needs approval). */
  proposedSavings: number;
}

export interface SpendBudgetSummary {
  id: string;
  scope: string;
  scopeId: string;
  scopeLabel: string;
  period: string;
  allocated: number;
  spent: number;
  remaining: number;
  utilizationPct: number;
}

export interface SpendOverview {
  totals: {
    totalBilled: number;
    invoiceCount: number;
    inReviewCount: number;
    potentialSavings: number;
    budgetAllocated: number;
    budgetSpent: number;
  };
  byStatus: Record<string, number>;
  firms: SpendFirmSummary[];
  invoices: SpendInvoiceSummary[];
  budgets: SpendBudgetSummary[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getSpendOverview(organizationId: string): Promise<SpendOverview> {
  const [vendors, invoices, budgets, timekeepers, matters] = await Promise.all([
    prisma.vendor.findMany({ where: { organizationId }, include: { timekeepers: true } }),
    prisma.invoice.findMany({
      where: { vendor: { organizationId } },
      include: { vendor: { select: { id: true, name: true } }, matter: { select: { id: true, title: true } }, lineItems: true },
      orderBy: { submittedAt: "desc" },
    }),
    prisma.budget.findMany({ where: { organizationId } }),
    prisma.timekeeper.findMany({ where: { vendor: { organizationId } } }),
    prisma.matter.findMany({ where: { organizationId }, select: { id: true, title: true } }),
  ]);

  const rateByTk: Record<string, number> = Object.fromEntries(timekeepers.map((t) => [t.personId, t.defaultRate]));
  const tksByVendor: Record<string, string[]> = {};
  for (const t of timekeepers) (tksByVendor[t.vendorId] ||= []).push(t.personId);
  const matterTitle: Record<string, string> = Object.fromEntries(matters.map((m) => [m.id, m.title]));

  // Matter budget remaining, for the OVER_BUDGET rule.
  const matterBudgetRemaining = (matterId: string): number | null => {
    const b = budgets.find((x) => x.scope === "MATTER" && x.scopeId === matterId);
    return b ? round2(b.allocatedAmount - b.spentAmount) : null;
  };

  const byFirmBilled: Record<string, number> = {};
  const byFirmInvoices: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let potentialSavings = 0;

  const invoiceSummaries: SpendInvoiceSummary[] = invoices.map((inv) => {
    byFirmBilled[inv.vendorId] = round2((byFirmBilled[inv.vendorId] || 0) + inv.amount);
    byFirmInvoices[inv.vendorId] = (byFirmInvoices[inv.vendorId] || 0) + 1;
    byStatus[inv.status] = (byStatus[inv.status] || 0) + 1;

    // Only invoices still in play get scrubbed for potential savings.
    const reviewable = inv.status === "SUBMITTED" || inv.status === "IN_REVIEW";
    const lines: ReviewLineItem[] = inv.lineItems.map((li) => ({
      id: li.id,
      timekeeperId: li.timekeeperId,
      hours: li.hours,
      rate: li.rate,
      amount: round2(li.hours * li.rate), // no separate billed amount in schema
      description: li.description,
      date: li.date.toISOString(),
    }));
    const ctx: ReviewContext = {
      invoiceId: inv.id,
      currency: inv.currency,
      periodStart: inv.periodStart.toISOString(),
      periodEnd: inv.periodEnd.toISOString(),
      approvedRateByTimekeeper: rateByTk,
      approvedTimekeeperIds: tksByVendor[inv.vendorId] || [],
      budgetRemaining: matterBudgetRemaining(inv.matterId),
    };
    const result = runInvoiceReview(lines, ctx);
    const deterministic = result.flags.filter((f) => f.severity === "deterministic").length;
    const judgment = result.flags.filter((f) => f.severity === "judgment").length;
    if (reviewable) potentialSavings = round2(potentialSavings + result.proposedShortPay);

    return {
      id: inv.id,
      vendorName: inv.vendor.name,
      matterId: inv.matterId,
      matterTitle: matterTitle[inv.matterId] || inv.matterId,
      amount: round2(inv.amount),
      currency: inv.currency,
      status: inv.status,
      periodStart: inv.periodStart.toISOString(),
      periodEnd: inv.periodEnd.toISOString(),
      lineCount: inv.lineItems.length,
      flagCount: result.flags.length,
      deterministicFlagCount: deterministic,
      judgmentFlagCount: judgment,
      proposedSavings: reviewable ? result.proposedShortPay : 0,
    };
  });

  const firms: SpendFirmSummary[] = vendors
    .map((v) => ({
      vendorId: v.id,
      name: v.name,
      type: v.type,
      counterpartyId: v.counterpartyId,
      performanceScore: v.performanceScore,
      timekeeperCount: v.timekeepers.length,
      invoiceCount: byFirmInvoices[v.id] || 0,
      totalBilled: byFirmBilled[v.id] || 0,
    }))
    .sort((a, b) => b.totalBilled - a.totalBilled);

  const budgetSummaries: SpendBudgetSummary[] = budgets
    .map((b) => {
      const remaining = round2(b.allocatedAmount - b.spentAmount);
      return {
        id: b.id,
        scope: b.scope,
        scopeId: b.scopeId,
        scopeLabel: b.scope === "MATTER" ? matterTitle[b.scopeId] || b.scopeId : b.scopeId,
        period: b.period,
        allocated: round2(b.allocatedAmount),
        spent: round2(b.spentAmount),
        remaining,
        utilizationPct: b.allocatedAmount > 0 ? Math.round((b.spentAmount / b.allocatedAmount) * 100) : 0,
      };
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct);

  const totalBilled = round2(invoices.reduce((s, i) => s + i.amount, 0));
  const budgetAllocated = round2(budgets.reduce((s, b) => s + b.allocatedAmount, 0));
  const budgetSpent = round2(budgets.reduce((s, b) => s + b.spentAmount, 0));

  return {
    totals: {
      totalBilled,
      invoiceCount: invoices.length,
      inReviewCount: (byStatus["IN_REVIEW"] || 0) + (byStatus["SUBMITTED"] || 0),
      potentialSavings,
      budgetAllocated,
      budgetSpent,
    },
    byStatus,
    firms,
    invoices: invoiceSummaries,
    budgets: budgetSummaries,
  };
}

/* ── SP-6 · GC spend analytics ────────────────────────────────────────── */

export interface SpendAnalytics {
  billed: number;
  proposedSavings: number;
  reductionRatePct: number;
  realizedSavings: number;
  realizedInvoiceCount: number;
  avgCycleDays: number | null;
  budgetAllocated: number;
  budgetSpent: number;
  budgetUtilizationPct: number;
  overBudgetCount: number;
  byMatter: Array<{ matterId: string; title: string; billed: number }>;
  byPractice: Array<{ practice: string; billed: number }>;
}

/**
 * GC analytics roll-up: reduction/realization rate, average review cycle
 * time, budget accuracy, and spend by matter + practice. Pure reads over
 * existing tables (invoices scrubbed by the engine for proposed savings;
 * realized savings from the chain-sealed approval audit rows). Gated like
 * the other spend reads.
 */
export async function getSpendAnalytics(organizationId: string): Promise<SpendAnalytics> {
  const [invoices, budgets, timekeepers, approvals] = await Promise.all([
    prisma.invoice.findMany({
      where: { vendor: { organizationId } },
      include: { matter: { select: { id: true, title: true, type: true } }, lineItems: true },
    }),
    prisma.budget.findMany({ where: { organizationId, scope: "MATTER" } }),
    prisma.timekeeper.findMany({ where: { vendor: { organizationId } } }),
    prisma.auditLog.findMany({ where: { organizationId, action: "spend.invoice.approved" }, select: { afterJson: true } }),
  ]);

  const rateByTk: Record<string, number> = Object.fromEntries(timekeepers.map((t) => [t.personId, t.defaultRate]));
  const tksByVendor: Record<string, string[]> = {};
  for (const t of timekeepers) (tksByVendor[t.vendorId] ||= []).push(t.personId);
  const remainingByMatter = (matterId: string): number | null => {
    const b = budgets.find((x) => x.scopeId === matterId);
    return b ? round2(b.allocatedAmount - b.spentAmount) : null;
  };

  let billed = 0;
  let proposedSavings = 0;
  const byMatterMap: Record<string, { title: string; billed: number }> = {};
  const byPracticeMap: Record<string, number> = {};

  for (const inv of invoices) {
    billed = round2(billed + inv.amount);
    const m = byMatterMap[inv.matterId] || { title: inv.matter.title, billed: 0 };
    m.billed = round2(m.billed + inv.amount);
    byMatterMap[inv.matterId] = m;
    const practice = String(inv.matter.type || "OTHER");
    byPracticeMap[practice] = round2((byPracticeMap[practice] || 0) + inv.amount);

    if (inv.status === "SUBMITTED" || inv.status === "IN_REVIEW") {
      const lines: ReviewLineItem[] = inv.lineItems.map((li) => ({
        id: li.id, timekeeperId: li.timekeeperId, hours: li.hours, rate: li.rate,
        amount: round2(li.hours * li.rate), description: li.description, date: li.date.toISOString(),
      }));
      const ctx: ReviewContext = {
        invoiceId: inv.id, currency: inv.currency,
        periodStart: inv.periodStart.toISOString(), periodEnd: inv.periodEnd.toISOString(),
        approvedRateByTimekeeper: rateByTk, approvedTimekeeperIds: tksByVendor[inv.vendorId] || [],
        budgetRemaining: remainingByMatter(inv.matterId),
      };
      proposedSavings = round2(proposedSavings + runInvoiceReview(lines, ctx).proposedShortPay);
    }
  }

  // Realized savings from the chain-sealed approval audit rows.
  let realizedSavings = 0;
  let realizedInvoiceCount = 0;
  for (const a of approvals) {
    const sp = Number((a.afterJson as { shortPay?: unknown } | null)?.shortPay);
    if (Number.isFinite(sp)) { realizedSavings = round2(realizedSavings + sp); realizedInvoiceCount++; }
  }

  // Review cycle time — submitted → approved.
  const cycleDays: number[] = [];
  for (const inv of invoices) {
    if (inv.approvedAt) cycleDays.push((inv.approvedAt.getTime() - inv.submittedAt.getTime()) / 86_400_000);
  }
  const avgCycleDays = cycleDays.length ? Math.round((cycleDays.reduce((s, n) => s + n, 0) / cycleDays.length) * 10) / 10 : null;

  const budgetAllocated = round2(budgets.reduce((s, b) => s + b.allocatedAmount, 0));
  const budgetSpent = round2(budgets.reduce((s, b) => s + b.spentAmount, 0));
  const overBudgetCount = budgets.filter((b) => b.spentAmount > b.allocatedAmount + 0.01).length;

  return {
    billed,
    proposedSavings,
    reductionRatePct: billed > 0 ? Math.round((proposedSavings / billed) * 1000) / 10 : 0,
    realizedSavings,
    realizedInvoiceCount,
    avgCycleDays,
    budgetAllocated,
    budgetSpent,
    budgetUtilizationPct: budgetAllocated > 0 ? Math.round((budgetSpent / budgetAllocated) * 100) : 0,
    overBudgetCount,
    byMatter: Object.entries(byMatterMap).map(([matterId, v]) => ({ matterId, title: v.title, billed: v.billed })).sort((a, b) => b.billed - a.billed).slice(0, 8),
    byPractice: Object.entries(byPracticeMap).map(([practice, b]) => ({ practice, billed: b })).sort((a, b) => b.billed - a.billed),
  };
}

/* ── Matter ↔ Spend link (sunsets the matter cost-basis stub) ─────────── */

export interface MatterSpendSummary {
  matterId: string;
  budgetAllocated: number;
  budgetSpent: number;
  approvedInvoiceTotal: number;
  approvedInvoiceCount: number;
  currency: string;
}

/**
 * Cost basis for one matter, from the Spend module's own data — the matter
 * budget plus the total of its APPROVED/PAID invoices. Replaces the matter
 * module's direct Budget/Invoice reads (the documented cross-module stub).
 */
export async function getMatterSpendSummary(organizationId: string, matterId: string): Promise<MatterSpendSummary> {
  const [budget, agg] = await Promise.all([
    prisma.budget.findFirst({ where: { organizationId, scope: "MATTER", scopeId: matterId }, orderBy: [{ period: "desc" }] }),
    prisma.invoice.aggregate({
      where: { matterId, status: { in: ["APPROVED", "PAID"] }, vendor: { organizationId } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  return {
    matterId,
    budgetAllocated: round2(budget?.allocatedAmount ?? 0),
    budgetSpent: round2(budget?.spentAmount ?? 0),
    approvedInvoiceTotal: round2(agg._sum.amount ?? 0),
    approvedInvoiceCount: agg._count._all,
    currency: "USD",
  };
}

export interface MatterInvoiceRow {
  id: string;
  vendorName: string;
  amount: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
}

/**
 * Every invoice on one matter (newest period first) — the per-matter invoice
 * list behind the matter workspace's Spend tab. Same org-scoping as the rest
 * of the Spend reads (vendor.organizationId).
 */
export async function listMatterInvoices(organizationId: string, matterId: string): Promise<MatterInvoiceRow[]> {
  const rows = await prisma.invoice.findMany({
    where: { matterId, vendor: { organizationId } },
    include: { vendor: { select: { name: true } } },
    orderBy: [{ periodEnd: "desc" }],
  });
  return rows.map((i) => ({
    id: i.id,
    vendorName: i.vendor?.name ?? "—",
    amount: round2(i.amount),
    currency: i.currency ?? "USD",
    status: i.status,
    periodStart: i.periodStart.toISOString(),
    periodEnd: i.periodEnd.toISOString(),
  }));
}
