/**
 * Invoice review + short-pay mutations (server-only, chain-sealed).
 *
 * The governed spine: load an invoice, scrub it with the SP-1 engine,
 * persist the flags, and let a reviewer approve (accepting the AI's
 * proposed short-pay) or reject — every state change writing a
 * chain-sealed AuditLog row (Differentiator #3). Conservative-AI: the
 * engine only *proposes*; the reviewer's approve is the only path that
 * moves money, and judgment flags never auto-reduce.
 */
import { prisma, logAudit } from "@aegis/db";
import { runInvoiceReview, type ReviewContext, type ReviewLineItem, type ReviewResult } from "./rules";

export interface InvoiceDetailLine {
  id: string;
  timekeeperId: string | null;
  timekeeperName: string | null;
  hours: number;
  rate: number;
  amount: number;
  description: string;
  date: string;
  status: string;
  flags: string[];
}

export interface InvoiceDetail {
  id: string;
  vendorName: string;
  matterId: string;
  matterTitle: string;
  amount: number;
  currency: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  lines: InvoiceDetailLine[];
  review: ReviewResult;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Load one invoice + build its review context + run the engine. */
async function loadAndReview(organizationId: string, invoiceId: string) {
  const inv = await prisma.invoice.findFirst({
    where: { id: invoiceId, vendor: { organizationId } },
    include: {
      vendor: { select: { id: true, name: true } },
      matter: { select: { id: true, title: true } },
      lineItems: { orderBy: { date: "asc" } },
    },
  });
  if (!inv) return null;

  const timekeepers = await prisma.timekeeper.findMany({ where: { vendorId: inv.vendorId } });
  const rateByTk: Record<string, number> = Object.fromEntries(timekeepers.map((t) => [t.personId, t.defaultRate]));
  const approvedTkIds = timekeepers.map((t) => t.personId);

  const budget = await prisma.budget.findFirst({
    where: { organizationId, scope: "MATTER", scopeId: inv.matterId },
  });
  const budgetRemaining = budget ? round2(budget.allocatedAmount - budget.spentAmount) : null;

  // Resolve timekeeper display names.
  const tkPersonIds = inv.lineItems.map((l) => l.timekeeperId).filter((x): x is string => !!x);
  const persons = tkPersonIds.length
    ? await prisma.person.findMany({ where: { id: { in: tkPersonIds } }, select: { id: true, name: true } })
    : [];
  const nameById: Record<string, string> = Object.fromEntries(persons.map((p) => [p.id, p.name]));

  const lines: ReviewLineItem[] = inv.lineItems.map((l) => ({
    id: l.id,
    timekeeperId: l.timekeeperId,
    timekeeperName: l.timekeeperId ? nameById[l.timekeeperId] || null : null,
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
    approvedTimekeeperIds: approvedTkIds,
    budgetRemaining,
  };
  const review = runInvoiceReview(lines, ctx);
  return { inv, lines, review, nameById };
}

export async function getInvoiceDetail(organizationId: string, invoiceId: string): Promise<InvoiceDetail | null> {
  const loaded = await loadAndReview(organizationId, invoiceId);
  if (!loaded) return null;
  const { inv, review, nameById } = loaded;
  return {
    id: inv.id,
    vendorName: inv.vendor.name,
    matterId: inv.matterId,
    matterTitle: inv.matter.title,
    amount: round2(inv.amount),
    currency: inv.currency,
    status: inv.status,
    periodStart: inv.periodStart.toISOString(),
    periodEnd: inv.periodEnd.toISOString(),
    approvedBy: inv.approvedBy,
    approvedAt: inv.approvedAt ? inv.approvedAt.toISOString() : null,
    rejectedReason: inv.rejectedReason,
    lines: inv.lineItems.map((l) => ({
      id: l.id,
      timekeeperId: l.timekeeperId,
      timekeeperName: l.timekeeperId ? nameById[l.timekeeperId] || null : null,
      hours: l.hours,
      rate: l.rate,
      amount: round2(l.hours * l.rate),
      description: l.description,
      date: l.date.toISOString(),
      status: l.status,
      flags: review.lineFlagByLine[l.id] || [],
    })),
    review,
  };
}

/** Run the engine and PERSIST flags onto the line items; move to IN_REVIEW. */
export async function runAndPersistReview(organizationId: string, invoiceId: string, actorId: string | null) {
  const loaded = await loadAndReview(organizationId, invoiceId);
  if (!loaded) throw new Error("Invoice not found");
  const { inv, review } = loaded;

  for (const l of inv.lineItems) {
    const flags = review.lineFlagByLine[l.id] || [];
    await prisma.invoiceLineItem.update({
      where: { id: l.id },
      data: { status: flags.length ? "FLAGGED" : "PENDING", flaggedReason: flags.length ? flags.join(", ") : null },
    });
  }
  if (inv.status === "SUBMITTED") {
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: "IN_REVIEW" } });
  }

  await logAudit({
    organizationId,
    actorId,
    actorType: actorId ? "USER" : "SYSTEM",
    action: "spend.invoice.reviewed",
    resourceType: "Invoice",
    resourceId: invoiceId,
    afterJson: {
      flags: review.flags.length,
      deterministic: review.flags.filter((f) => f.severity === "deterministic").length,
      judgment: review.flags.filter((f) => f.severity === "judgment").length,
      proposedShortPay: review.proposedShortPay,
      proposedApprovedAmount: review.proposedApprovedAmount,
    } as never,
    metadata: { source: "spend-review" } as never,
  });
  return review;
}

/**
 * Approve an invoice, accepting the engine's deterministic short-pay.
 * The approved amount = invoiced − deterministic reductions. Judgment
 * flags do NOT reduce (they need a separate human waive/uphold, SP-3b).
 * Chain-sealed: the short-pay amount lives in the AuditLog — the
 * evidentiary record — and the invoice moves to APPROVED.
 */
export async function approveInvoice(organizationId: string, invoiceId: string, actorId: string) {
  const loaded = await loadAndReview(organizationId, invoiceId);
  if (!loaded) throw new Error("Invoice not found");
  const { inv, review } = loaded;
  if (inv.status === "APPROVED" || inv.status === "PAID") throw new Error("Invoice is already approved");

  // Stamp line statuses from the deterministic flags.
  for (const l of inv.lineItems) {
    const flags = review.lineFlagByLine[l.id] || [];
    const hasDeterministic = flags.some((c) =>
      ["MATH_ERROR", "RATE_OVER_CARD", "UNAPPROVED_TIMEKEEPER", "OUT_OF_PERIOD", "DUPLICATE", "NON_BILLABLE"].includes(c),
    );
    await prisma.invoiceLineItem.update({
      where: { id: l.id },
      data: { status: hasDeterministic ? "REDUCED" : "ACCEPTED" },
    });
  }

  await prisma.invoice.update({
    where: { id: inv.id },
    data: { status: "APPROVED", approvedBy: actorId, approvedAt: new Date() },
  });

  // Advance the matter budget by the approved amount.
  const budget = await prisma.budget.findFirst({ where: { organizationId, scope: "MATTER", scopeId: inv.matterId } });
  if (budget) {
    await prisma.budget.update({
      where: { id: budget.id },
      data: { spentAmount: round2(budget.spentAmount + review.proposedApprovedAmount) },
    });
  }

  await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: "spend.invoice.approved",
    resourceType: "Invoice",
    resourceId: invoiceId,
    beforeJson: { status: inv.status } as never,
    afterJson: {
      status: "APPROVED",
      invoicedAmount: review.invoicedAmount,
      approvedAmount: review.proposedApprovedAmount,
      shortPay: review.proposedShortPay,
      currency: inv.currency,
    } as never,
    metadata: { source: "spend-review" } as never,
  });
  return { approvedAmount: review.proposedApprovedAmount, shortPay: review.proposedShortPay };
}

export async function rejectInvoice(organizationId: string, invoiceId: string, reason: string, actorId: string) {
  const inv = await prisma.invoice.findFirst({ where: { id: invoiceId, vendor: { organizationId } }, select: { id: true, status: true } });
  if (!inv) throw new Error("Invoice not found");
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: "REJECTED", rejectedReason: reason || "Rejected on review" } });
  await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: "spend.invoice.rejected",
    resourceType: "Invoice",
    resourceId: invoiceId,
    beforeJson: { status: inv.status } as never,
    afterJson: { status: "REJECTED", reason: reason || "Rejected on review" } as never,
    metadata: { source: "spend-review" } as never,
  });
}
