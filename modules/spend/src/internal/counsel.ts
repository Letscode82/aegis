/**
 * Outside-counsel management reads (server-only).
 *
 * The "firms" sub-domain: each law firm (a Counterparty-backed Vendor)
 * with its rate card, timekeeper roster, and a data-driven scorecard
 * derived from its invoices — total billed, how many of its invoices the
 * AI flagged, and the short-pay the engine proposes against it. This is
 * evidence-based panel management: who bills clean, who leaks.
 */
import { prisma } from "@aegis/db";
import { runInvoiceReview, type ReviewContext, type ReviewLineItem } from "./review/rules";

export interface CounselTimekeeper {
  personId: string;
  name: string;
  title: string;
  defaultRate: number;
  blendedRate: number | null;
}

export interface CounselRateCardEntry {
  tier: string;
  rate: number;
}

export interface CounselScorecard {
  totalBilled: number;
  invoiceCount: number;
  flaggedInvoiceCount: number;
  cleanInvoiceCount: number;
  proposedSavings: number;
  reductionRatePct: number; // proposedSavings / totalBilled
  avgInvoice: number;
}

export interface CounselFirm {
  vendorId: string;
  name: string;
  type: string;
  counterpartyId: string | null;
  performanceScore: number | null;
  rateCard: CounselRateCardEntry[];
  timekeepers: CounselTimekeeper[];
  scorecard: CounselScorecard;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getOutsideCounselOverview(organizationId: string): Promise<CounselFirm[]> {
  const [vendors, invoices, timekeepers, persons, budgets] = await Promise.all([
    prisma.vendor.findMany({ where: { organizationId } }),
    prisma.invoice.findMany({
      where: { vendor: { organizationId } },
      include: { lineItems: true },
    }),
    prisma.timekeeper.findMany({ where: { vendor: { organizationId } } }),
    prisma.person.findMany({ where: { organizationId, type: "EXTERNAL_COUNSEL" }, select: { id: true, name: true } }),
    prisma.budget.findMany({ where: { organizationId, scope: "MATTER" } }),
  ]);

  const nameById: Record<string, string> = Object.fromEntries(persons.map((p) => [p.id, p.name]));
  const rateByTk: Record<string, number> = Object.fromEntries(timekeepers.map((t) => [t.personId, t.defaultRate]));
  const budgetRemainingByMatter: Record<string, number> = {};
  for (const b of budgets) budgetRemainingByMatter[b.scopeId] = round2(b.allocatedAmount - b.spentAmount);

  const tksByVendor: Record<string, CounselTimekeeper[]> = {};
  const tkIdsByVendor: Record<string, string[]> = {};
  for (const t of timekeepers) {
    (tksByVendor[t.vendorId] ||= []).push({
      personId: t.personId,
      name: nameById[t.personId] || t.personId,
      title: t.title,
      defaultRate: t.defaultRate,
      blendedRate: t.blendedRate,
    });
    (tkIdsByVendor[t.vendorId] ||= []).push(t.personId);
  }

  return vendors
    .map((v) => {
      const firmInvoices = invoices.filter((i) => i.vendorId === v.id);
      let totalBilled = 0;
      let flaggedInvoiceCount = 0;
      let proposedSavings = 0;

      for (const inv of firmInvoices) {
        totalBilled += inv.amount;
        const lines: ReviewLineItem[] = inv.lineItems.map((l) => ({
          id: l.id,
          timekeeperId: l.timekeeperId,
          hours: l.hours,
          rate: l.rate,
          amount: round2(l.hours * l.rate),
          description: l.description,
          date: l.date.toISOString(),
        }));
        const ctx: ReviewContext = {
          invoiceId: inv.id,
          currency: inv.currency,
          periodStart: inv.periodStart.toISOString(),
          periodEnd: inv.periodEnd.toISOString(),
          approvedRateByTimekeeper: rateByTk,
          approvedTimekeeperIds: tkIdsByVendor[v.id] || [],
          budgetRemaining: budgetRemainingByMatter[inv.matterId] ?? null,
        };
        const review = runInvoiceReview(lines, ctx);
        if (review.flags.length > 0) flaggedInvoiceCount++;
        proposedSavings += review.proposedShortPay;
      }

      totalBilled = round2(totalBilled);
      proposedSavings = round2(proposedSavings);

      const rateCard: CounselRateCardEntry[] = Object.entries((v.ratesCard as Record<string, number>) || {})
        .map(([tier, rate]) => ({ tier, rate: Number(rate) }))
        .sort((a, b) => b.rate - a.rate);

      const scorecard: CounselScorecard = {
        totalBilled,
        invoiceCount: firmInvoices.length,
        flaggedInvoiceCount,
        cleanInvoiceCount: firmInvoices.length - flaggedInvoiceCount,
        proposedSavings,
        reductionRatePct: totalBilled > 0 ? Math.round((proposedSavings / totalBilled) * 1000) / 10 : 0,
        avgInvoice: firmInvoices.length > 0 ? round2(totalBilled / firmInvoices.length) : 0,
      };

      return {
        vendorId: v.id,
        name: v.name,
        type: v.type,
        counterpartyId: v.counterpartyId,
        performanceScore: v.performanceScore,
        rateCard,
        timekeepers: (tksByVendor[v.id] || []).sort((a, b) => b.defaultRate - a.defaultRate),
        scorecard,
      };
    })
    .sort((a, b) => b.scorecard.totalBilled - a.scorecard.totalBilled);
}
