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
