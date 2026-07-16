/**
 * Invoice-review rule engine (pure, DB-free, unit-tested).
 *
 * The heart of the Spend module — what BrightFlag / TeamConnect /
 * SimpleLegal all lead with. Given a normalized invoice (header + line
 * items) and a review context (approved rates, roster, budget,
 * guidelines), it returns a set of FLAGS with a proposed short-pay.
 *
 * Governance split (AEGIS conservative-AI, non-negotiable #7):
 *   - "deterministic" flags are math/rule facts — they may auto-reduce
 *     where the billing guideline authorises, and always write an audit
 *     row. Their reductions feed `proposedApprovedAmount`.
 *   - "judgment" flags (block-billing, vague narrative, excessive hours)
 *     are heuristics — they surface a recommendation only; the reduction
 *     is 0 until a human approves (the service layer writes an
 *     `AgentDecision` PENDING row for these). They never auto-reduce.
 *
 * The service layer (review/service.ts) loads DB rows, builds a
 * ReviewContext, calls runInvoiceReview, and persists the flags onto
 * InvoiceLineItem.status / flaggedReason. Keeping the rules here means
 * they are testable without a database and identical everywhere.
 */

export interface ReviewLineItem {
  id: string;
  timekeeperId: string | null;
  timekeeperName?: string | null;
  hours: number;
  rate: number;
  /** Line total as billed. If it disagrees with hours*rate → MATH_ERROR. */
  amount: number;
  description: string;
  /** ISO date the work was performed. */
  date: string;
}

export interface ReviewGuidelines {
  /** Flag a single-day single-timekeeper entry above this many hours. */
  maxHoursPerEntry: number;
  /** Narratives shorter than this (chars) are "vague". */
  minNarrativeChars: number;
  /** Substrings that mark clerical / non-billable work. */
  nonBillableKeywords: string[];
  /** Vague-narrative phrases (lowercased substring match). */
  vaguePhrases: string[];
}

export const DEFAULT_GUIDELINES: ReviewGuidelines = {
  maxHoursPerEntry: 12,
  minNarrativeChars: 12,
  nonBillableKeywords: [
    "clerical",
    "secretarial",
    "administrative",
    "word processing",
    "printing",
    "photocopying",
    "filing documents",
    "organizing files",
    "scheduling",
  ],
  vaguePhrases: [
    "attention to matter",
    "attention to file",
    "review documents",
    "review file",
    "work on matter",
    "various matters",
    "miscellaneous",
    "review and revise",
    "conference re matter",
    "prepare for meeting",
  ],
};

export interface ReviewContext {
  invoiceId: string;
  currency: string;
  /** Invoice period — work outside it is OUT_OF_PERIOD. ISO dates. */
  periodStart: string;
  periodEnd: string;
  /** Approved rate per timekeeperId (rate card / timekeeper.defaultRate). */
  approvedRateByTimekeeper: Record<string, number>;
  /** Timekeeper ids authorised to bill this matter/firm. */
  approvedTimekeeperIds: string[];
  /** Budget remaining for the matter (allocated − spent). null = no budget. */
  budgetRemaining: number | null;
  guidelines?: Partial<ReviewGuidelines>;
}

export type FlagCode =
  | "MATH_ERROR"
  | "RATE_OVER_CARD"
  | "UNAPPROVED_TIMEKEEPER"
  | "OUT_OF_PERIOD"
  | "DUPLICATE"
  | "NON_BILLABLE"
  | "OVER_BUDGET"
  | "BLOCK_BILLING"
  | "VAGUE_NARRATIVE"
  | "EXCESSIVE_HOURS";

export type FlagSeverity = "deterministic" | "judgment";

export interface ReviewFlag {
  /** Line the flag attaches to, or null for an invoice-level flag. */
  lineId: string | null;
  code: FlagCode;
  severity: FlagSeverity;
  message: string;
  /** Suggested short-pay for this flag (deterministic only; 0 for judgment). */
  proposedReduction: number;
}

export interface ReviewResult {
  flags: ReviewFlag[];
  invoicedAmount: number;
  /** invoiced − sum(deterministic reductions). Judgment flags don't reduce. */
  proposedApprovedAmount: number;
  proposedShortPay: number;
  /** Per-line: the highest-severity code, for quick status stamping. */
  lineFlagByLine: Record<string, FlagCode[]>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Count distinct task verbs / clause separators as a block-billing heuristic. */
function blockBillingSignals(desc: string): number {
  const d = desc.toLowerCase();
  const separators = (d.match(/;| and | then |, and |\. /g) || []).length;
  const verbs = [
    "draft",
    "review",
    "revise",
    "call",
    "confer",
    "research",
    "prepare",
    "analyze",
    "attend",
    "correspond",
    "negotiate",
  ].filter((v) => d.includes(v)).length;
  return separators + Math.max(0, verbs - 1);
}

export function runInvoiceReview(lines: ReviewLineItem[], ctx: ReviewContext): ReviewResult {
  const g: ReviewGuidelines = { ...DEFAULT_GUIDELINES, ...(ctx.guidelines || {}) };
  const flags: ReviewFlag[] = [];
  const approved = new Set(ctx.approvedTimekeeperIds);
  const periodStart = Date.parse(ctx.periodStart);
  const periodEnd = Date.parse(ctx.periodEnd);
  const seen = new Map<string, string>(); // dup key → first lineId

  const invoicedAmount = round2(lines.reduce((s, l) => s + (l.amount || 0), 0));

  for (const l of lines) {
    const computed = round2(l.hours * l.rate);

    // MATH_ERROR — billed amount disagrees with hours × rate.
    if (Math.abs(computed - l.amount) > 0.01) {
      flags.push({
        lineId: l.id,
        code: "MATH_ERROR",
        severity: "deterministic",
        message: `Math error: ${l.hours}h × ${l.rate} = ${computed}, billed ${l.amount}.`,
        proposedReduction: Math.max(0, round2(l.amount - computed)),
      });
    }

    // RATE_OVER_CARD — rate above the timekeeper's approved rate.
    const approvedRate = l.timekeeperId ? ctx.approvedRateByTimekeeper[l.timekeeperId] : undefined;
    if (approvedRate != null && l.rate > approvedRate + 0.01) {
      flags.push({
        lineId: l.id,
        code: "RATE_OVER_CARD",
        severity: "deterministic",
        message: `Rate ${l.rate} exceeds approved card rate ${approvedRate} for ${l.timekeeperName || l.timekeeperId}.`,
        proposedReduction: round2((l.rate - approvedRate) * l.hours),
      });
    }

    // UNAPPROVED_TIMEKEEPER — biller not on the approved roster.
    if (ctx.approvedTimekeeperIds.length > 0 && (!l.timekeeperId || !approved.has(l.timekeeperId))) {
      flags.push({
        lineId: l.id,
        code: "UNAPPROVED_TIMEKEEPER",
        severity: "deterministic",
        message: `Timekeeper ${l.timekeeperName || l.timekeeperId || "(none)"} is not on the approved roster for this matter.`,
        proposedReduction: round2(l.amount),
      });
    }

    // OUT_OF_PERIOD — work dated outside the invoice window.
    const workDate = Date.parse(l.date);
    if (!Number.isNaN(workDate) && (workDate < periodStart || workDate > periodEnd)) {
      flags.push({
        lineId: l.id,
        code: "OUT_OF_PERIOD",
        severity: "deterministic",
        message: `Work dated ${l.date} is outside the invoice period ${ctx.periodStart}–${ctx.periodEnd}.`,
        proposedReduction: round2(l.amount),
      });
    }

    // DUPLICATE — same timekeeper/date/description/amount as an earlier line.
    const dupKey = `${l.timekeeperId}|${l.date}|${l.description.trim().toLowerCase()}|${l.amount}`;
    if (seen.has(dupKey)) {
      flags.push({
        lineId: l.id,
        code: "DUPLICATE",
        severity: "deterministic",
        message: `Duplicate of an earlier line (same timekeeper, date, narrative and amount).`,
        proposedReduction: round2(l.amount),
      });
    } else {
      seen.set(dupKey, l.id);
    }

    // NON_BILLABLE — clerical / administrative work.
    const dl = l.description.toLowerCase();
    if (g.nonBillableKeywords.some((k) => dl.includes(k))) {
      flags.push({
        lineId: l.id,
        code: "NON_BILLABLE",
        severity: "deterministic",
        message: `Clerical / non-billable work should not be billed at counsel rates.`,
        proposedReduction: round2(l.amount),
      });
    }

    // --- Judgment flags (no auto-reduction) ---

    // VAGUE_NARRATIVE
    const narrative = l.description.trim();
    if (narrative.length < g.minNarrativeChars || g.vaguePhrases.some((p) => dl.includes(p))) {
      flags.push({
        lineId: l.id,
        code: "VAGUE_NARRATIVE",
        severity: "judgment",
        message: `Narrative is too vague to assess ("${narrative.slice(0, 40)}"). Needs reviewer judgment.`,
        proposedReduction: 0,
      });
    }

    // BLOCK_BILLING
    if (blockBillingSignals(l.description) >= 2 && l.hours >= 2) {
      flags.push({
        lineId: l.id,
        code: "BLOCK_BILLING",
        severity: "judgment",
        message: `Multiple tasks lumped in one ${l.hours}h entry (block billing). Needs reviewer judgment.`,
        proposedReduction: 0,
      });
    }

    // EXCESSIVE_HOURS
    if (l.hours > g.maxHoursPerEntry) {
      flags.push({
        lineId: l.id,
        code: "EXCESSIVE_HOURS",
        severity: "judgment",
        message: `${l.hours}h in a single entry exceeds the ${g.maxHoursPerEntry}h guideline. Needs reviewer judgment.`,
        proposedReduction: 0,
      });
    }
  }

  // OVER_BUDGET — invoice-level: this invoice pushes the matter past budget.
  if (ctx.budgetRemaining != null && invoicedAmount > ctx.budgetRemaining + 0.01) {
    flags.push({
      lineId: null,
      code: "OVER_BUDGET",
      severity: "judgment",
      message: `Invoice of ${invoicedAmount} ${ctx.currency} exceeds remaining matter budget of ${round2(ctx.budgetRemaining)}. Needs reviewer judgment.`,
      proposedReduction: 0,
    });
  }

  const deterministicReduction = round2(
    flags.filter((f) => f.severity === "deterministic").reduce((s, f) => s + f.proposedReduction, 0),
  );

  const lineFlagByLine: Record<string, FlagCode[]> = {};
  for (const f of flags) {
    if (!f.lineId) continue;
    (lineFlagByLine[f.lineId] ||= []).push(f.code);
  }

  return {
    flags,
    invoicedAmount,
    proposedApprovedAmount: round2(Math.max(0, invoicedAmount - deterministicReduction)),
    proposedShortPay: deterministicReduction,
    lineFlagByLine,
  };
}
