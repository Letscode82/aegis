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
import { prisma, logAudit, sha256Hex, AgentApprovalStatus } from "@aegis/db";
import { runInvoiceReview, type ReviewContext, type ReviewLineItem, type ReviewResult } from "./rules";
import { assessJudgment, type JudgmentLineAssessment } from "./ai-judge";

/** SP-4 — the AI billing-judge writes AgentDecision rows under this identity. */
const JUDGE_AGENT = "spend-billing-judge";
const JUDGE_RESOURCE = "Invoice";

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

export interface JudgmentDecisionDTO {
  id: string;
  status: string; // PENDING | APPROVED | APPROVED_WITH_OVERRIDE | REJECTED
  confidence: number | null;
  degraded: boolean;
  perLine: JudgmentLineAssessment[];
  totalRecommendedReduction: number;
  /** Human-approved short-pay total (set once resolved to APPROVED*). */
  approvedTotal: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
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
  /** SP-4 — the latest AI billing-judgment decision for this invoice, if any. */
  judgment: JudgmentDecisionDTO | null;
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
  const judgment = await getInvoiceJudgment(organizationId, invoiceId);
  return {
    judgment,
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

  // SP-4: fold in any human-APPROVED AI judgment reductions. Judgment flags
  // never auto-reduce — they reduce here only because a reviewer approved the
  // AgentDecision (conservative-AI gate). Reduction-by-line, clamped to billed.
  const approvedJudgment = await approvedJudgmentReductions(organizationId, invoiceId);
  const judgmentReducedLineIds = new Set(Object.keys(approvedJudgment.byLine).filter((id) => approvedJudgment.byLine[id]! > 0));
  const judgmentTotal = approvedJudgment.total;

  // Stamp line statuses: reduced if a deterministic flag OR an approved
  // judgment reduction applies; accepted otherwise.
  for (const l of inv.lineItems) {
    const flags = review.lineFlagByLine[l.id] || [];
    const hasDeterministic = flags.some((c) =>
      ["MATH_ERROR", "RATE_OVER_CARD", "UNAPPROVED_TIMEKEEPER", "OUT_OF_PERIOD", "DUPLICATE", "NON_BILLABLE"].includes(c),
    );
    const reduced = hasDeterministic || judgmentReducedLineIds.has(l.id);
    await prisma.invoiceLineItem.update({
      where: { id: l.id },
      data: { status: reduced ? "REDUCED" : "ACCEPTED" },
    });
  }

  const approvedAmount = round2(Math.max(0, review.proposedApprovedAmount - judgmentTotal));
  const shortPay = round2(review.proposedShortPay + judgmentTotal);

  await prisma.invoice.update({
    where: { id: inv.id },
    data: { status: "APPROVED", approvedBy: actorId, approvedAt: new Date() },
  });

  // Advance the matter budget by the approved amount.
  const budget = await prisma.budget.findFirst({ where: { organizationId, scope: "MATTER", scopeId: inv.matterId } });
  if (budget) {
    await prisma.budget.update({
      where: { id: budget.id },
      data: { spentAmount: round2(budget.spentAmount + approvedAmount) },
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
      approvedAmount,
      shortPay,
      deterministicShortPay: review.proposedShortPay,
      judgmentShortPay: judgmentTotal,
      currency: inv.currency,
    } as never,
    metadata: { source: "spend-review" } as never,
  });
  return { approvedAmount, shortPay, deterministicShortPay: review.proposedShortPay, judgmentShortPay: judgmentTotal };
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

/* ── SP-4 · AI billing-judge (AgentDecision gate) ─────────────────────── */

interface JudgmentRec {
  perLine: JudgmentLineAssessment[];
  totalRecommendedReduction: number;
  degraded: boolean;
  approved?: Array<{ lineId: string; reduction: number }>;
  approvedTotal?: number;
}

async function resolveUserName(id: string | null): Promise<string | null> {
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { name: true } }).catch(() => null);
  return u?.name ?? null;
}

function toJudgmentDTO(
  d: { id: string; approvalStatus: string; confidence: number | null; approvedAt: Date | null; recommendationJson: unknown },
  approverName: string | null,
): JudgmentDecisionDTO {
  const rec = (d.recommendationJson ?? {}) as unknown as JudgmentRec;
  return {
    id: d.id,
    status: d.approvalStatus,
    confidence: d.confidence,
    degraded: !!rec.degraded,
    perLine: Array.isArray(rec.perLine) ? rec.perLine : [],
    totalRecommendedReduction: round2(rec.totalRecommendedReduction || 0),
    approvedTotal: rec.approvedTotal != null ? round2(rec.approvedTotal) : null,
    approvedByName: approverName,
    approvedAt: d.approvedAt ? d.approvedAt.toISOString() : null,
  };
}

/** Latest AI-judgment decision for an invoice (any status), as a DTO. */
export async function getInvoiceJudgment(organizationId: string, invoiceId: string): Promise<JudgmentDecisionDTO | null> {
  const d = await prisma.agentDecision.findFirst({
    where: { organizationId, resourceType: JUDGE_RESOURCE, resourceId: invoiceId, agentName: JUDGE_AGENT },
    orderBy: { createdAt: "desc" },
  });
  if (!d) return null;
  return toJudgmentDTO(d, await resolveUserName(d.approvedById));
}

/** Sum of human-APPROVED judgment reductions for an invoice, per line + total. */
async function approvedJudgmentReductions(
  organizationId: string,
  invoiceId: string,
): Promise<{ byLine: Record<string, number>; total: number }> {
  const d = await prisma.agentDecision.findFirst({
    where: {
      organizationId, resourceType: JUDGE_RESOURCE, resourceId: invoiceId, agentName: JUDGE_AGENT,
      approvalStatus: { in: [AgentApprovalStatus.APPROVED, AgentApprovalStatus.APPROVED_WITH_OVERRIDE] },
    },
    orderBy: { createdAt: "desc" },
  });
  const byLine: Record<string, number> = {};
  if (!d) return { byLine, total: 0 };
  const rec = (d.recommendationJson ?? {}) as unknown as JudgmentRec;
  for (const a of rec.approved ?? []) byLine[a.lineId] = round2(a.reduction);
  return { byLine, total: round2(Object.values(byLine).reduce((s, n) => s + n, 0)) };
}

/**
 * Run the AI billing-judge over an invoice's judgment-flagged lines and write
 * (or refresh) a PENDING AgentDecision. Proposes only — no money moves until a
 * reviewer resolves it. Returns null when there are no judgment flags to assess.
 */
export async function proposeInvoiceJudgment(
  organizationId: string,
  invoiceId: string,
  actorId: string | null,
): Promise<JudgmentDecisionDTO | null> {
  const loaded = await loadAndReview(organizationId, invoiceId);
  if (!loaded) throw new Error("Invoice not found");
  const assessment = await assessJudgment(loaded.lines, loaded.review.flags);
  if (assessment.perLine.length === 0) return null;

  const recommendationJson: JudgmentRec = {
    perLine: assessment.perLine,
    totalRecommendedReduction: assessment.totalRecommendedReduction,
    degraded: assessment.degraded,
  };
  const promptHash = sha256Hex(assessment.promptText);

  const existing = await prisma.agentDecision.findFirst({
    where: { organizationId, resourceType: JUDGE_RESOURCE, resourceId: invoiceId, agentName: JUDGE_AGENT },
    orderBy: { createdAt: "desc" },
  });

  let decision;
  if (existing && existing.approvalStatus === AgentApprovalStatus.PENDING) {
    decision = await prisma.agentDecision.update({
      where: { id: existing.id },
      data: {
        modelVersion: assessment.degraded ? "degraded-fallback" : "live",
        promptHash,
        recommendationJson: recommendationJson as never,
        confidence: assessment.confidence,
      },
    });
  } else {
    decision = await prisma.agentDecision.create({
      data: {
        organizationId,
        resourceType: JUDGE_RESOURCE,
        resourceId: invoiceId,
        agentName: JUDGE_AGENT,
        modelId: assessment.model,
        modelVersion: assessment.degraded ? "degraded-fallback" : "live",
        promptHash,
        recommendationJson: recommendationJson as never,
        confidence: assessment.confidence,
        approvalStatus: AgentApprovalStatus.PENDING,
      },
    });
  }

  await logAudit({
    organizationId,
    actorId,
    actorType: actorId ? "USER" : "SYSTEM",
    action: "spend.invoice.judgment_proposed",
    resourceType: "AgentDecision",
    resourceId: decision.id,
    afterJson: { invoiceId, lines: assessment.perLine.length, totalRecommendedReduction: assessment.totalRecommendedReduction, degraded: assessment.degraded } as never,
    metadata: { source: "spend-review", agent: JUDGE_AGENT } as never,
  });

  return toJudgmentDTO(decision, null);
}

/**
 * The human gate for the AI judgment. approve = accept the recommended
 * reductions; approve_override = accept the reviewer's edited per-line
 * reductions; reject = decline (no reduction). The reduction is applied to the
 * invoice at approve time (approveInvoice reads the APPROVED decision); this
 * records the verdict and is immutable afterward. Chain-sealed.
 */
export async function resolveInvoiceJudgment(
  organizationId: string,
  invoiceId: string,
  decisionId: string,
  action: "approve" | "approve_override" | "reject",
  actorId: string,
  overrides?: Array<{ lineId: string; reduction: number }>,
): Promise<JudgmentDecisionDTO> {
  const decision = await prisma.agentDecision.findFirst({
    where: { id: decisionId, organizationId, resourceType: JUDGE_RESOURCE, resourceId: invoiceId, agentName: JUDGE_AGENT },
  });
  if (!decision) throw new Error("Judgment decision not found");
  if (decision.approvalStatus !== AgentApprovalStatus.PENDING) {
    throw new Error("This judgment has already been resolved — the verdict is immutable.");
  }
  const rec = (decision.recommendationJson ?? {}) as unknown as JudgmentRec;
  const billedByLine: Record<string, number> = Object.fromEntries((rec.perLine ?? []).map((p) => [p.lineId, p.billedAmount]));

  let approved: Array<{ lineId: string; reduction: number }> = [];
  let status: AgentApprovalStatus;
  if (action === "reject") {
    status = AgentApprovalStatus.REJECTED;
  } else if (action === "approve_override") {
    status = AgentApprovalStatus.APPROVED_WITH_OVERRIDE;
    const cap = (id: string, r: number) => Math.max(0, Math.min(round2(r), billedByLine[id] ?? r));
    approved = (overrides ?? []).filter((o) => billedByLine[o.lineId] != null).map((o) => ({ lineId: o.lineId, reduction: cap(o.lineId, Number(o.reduction) || 0) }));
  } else {
    status = AgentApprovalStatus.APPROVED;
    approved = (rec.perLine ?? []).map((p) => ({ lineId: p.lineId, reduction: round2(p.recommendedReduction) }));
  }
  const approvedTotal = round2(approved.reduce((s, a) => s + a.reduction, 0));

  const auditId = await logAudit({
    organizationId,
    actorId,
    actorType: "USER",
    action: action === "reject" ? "spend.invoice.judgment_rejected" : "spend.invoice.judgment_approved",
    resourceType: "AgentDecision",
    resourceId: decision.id,
    beforeJson: { status: "PENDING" } as never,
    afterJson: { invoiceId, status, approvedTotal } as never,
    metadata: { source: "spend-review", agent: JUDGE_AGENT } as never,
  });

  const updated = await prisma.agentDecision.update({
    where: { id: decision.id },
    data: {
      approvalStatus: status,
      approvedById: action === "reject" ? null : actorId,
      approvedAt: new Date(),
      resultingAuditLogId: auditId ?? null,
      recommendationJson: { ...rec, approved, approvedTotal } as never,
    },
  });
  return toJudgmentDTO(updated, await resolveUserName(updated.approvedById));
}
