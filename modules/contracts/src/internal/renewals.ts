/**
 * Contract renewals — the command center (CLM Obligations & Renewals, Phase 1).
 *
 * The differentiator legal teams actually buy: never let a contract silently
 * auto-renew because nobody tracked the notice deadline. This service:
 *
 *   - getRenewalPipeline()          — every live contract bucketed by renewal
 *                                     urgency, each with the EXACT act-by date
 *                                     (expiry − noticeWindowDays).
 *   - recordRenewalDecision()       — the GC's explicit renew / renegotiate /
 *                                     non-renewal choice, chain-sealed. RENEW
 *                                     rolls expiry forward a term and re-arms
 *                                     the next cycle.
 *   - markRenewalNoticeSent()       — stamps the notice and closes the matching
 *                                     RENEWAL_NOTICE obligation.
 *   - ensureRenewalNoticeObligations() — auto-creates a RENEWAL_NOTICE
 *                                     obligation for auto-renew contracts whose
 *                                     notice deadline is approaching, so renewals
 *                                     flow into the shared obligation ledger,
 *                                     the alerts card, and (Phase 2) the calendar.
 *
 * Every mutation is chain-sealed via logAudit. No renewal state is inferred at
 * read time and then acted on silently — a human records the decision.
 */
import { prisma, logAudit } from "@aegis/db";
import type { RenewalDecision } from "@aegis/db";
import { addMonths } from "./recurrence";
import { createObligation, updateObligationStatus } from "./service";

const DAY_MS = 86_400_000;
const LIVE_STATUSES = ["ACTIVE", "EXECUTED"] as const;

// Tunable horizons (days). Defaults chosen to match how GCs think: "act within
// a month" for the notice deadline, "this quarter" for expiry.
const DEFAULT_NOTICE_SOON_DAYS = 30;
const DEFAULT_EXPIRING_SOON_DAYS = 60;
const DEFAULT_HORIZON_DAYS = 180;
const DEFAULT_NOTICE_OBLIGATION_HORIZON_DAYS = 90;

type Actor = { id: string | null; type?: "USER" | "AGENT" | "SYSTEM" };
const actorFields = (actor: Actor) => ({
  actorId: actor.id,
  actorType: actor.type ?? (actor.id ? "USER" : "SYSTEM"),
});

export type RenewalUrgency =
  | "EXPIRED"
  | "NOTICE_WINDOW_MISSED"
  | "NOTICE_WINDOW_CLOSING"
  | "EXPIRING_SOON"
  | "UPCOMING"
  | "FUTURE";

/** Sort/priority rank — lower is more urgent. */
export const RENEWAL_URGENCY_RANK: Record<RenewalUrgency, number> = {
  EXPIRED: 0,
  NOTICE_WINDOW_MISSED: 1,
  NOTICE_WINDOW_CLOSING: 2,
  EXPIRING_SOON: 3,
  UPCOMING: 4,
  FUTURE: 5,
};

export interface RenewalUrgencyInput {
  status: string;
  autoRenew: boolean;
  expiryDate: Date | null;
  noticeWindowDays: number | null;
  renewalNoticeSentAt: Date | null;
  renewalDecision: RenewalDecision;
}

export interface RenewalUrgencyResult {
  urgency: RenewalUrgency;
  daysToExpiry: number | null;
  noticeDeadline: Date | null;
  daysToNoticeDeadline: number | null;
  /** True when a decision was recorded or the notice was sent for this cycle. */
  noticeHandled: boolean;
}

export interface RenewalHorizons {
  noticeSoonDays?: number;
  expiringSoonDays?: number;
  horizonDays?: number;
}

const daysUntil = (from: Date, to: Date): number => Math.floor((to.getTime() - from.getTime()) / DAY_MS);

/**
 * Classify a contract's renewal urgency. Pure — the pipeline read and the
 * tests both call this so "what counts as an auto-renewal trap" has one home.
 */
export function classifyRenewalUrgency(
  input: RenewalUrgencyInput,
  now: Date,
  horizons: RenewalHorizons = {},
): RenewalUrgencyResult {
  const noticeSoonDays = horizons.noticeSoonDays ?? DEFAULT_NOTICE_SOON_DAYS;
  const expiringSoonDays = horizons.expiringSoonDays ?? DEFAULT_EXPIRING_SOON_DAYS;
  const horizonDays = horizons.horizonDays ?? DEFAULT_HORIZON_DAYS;

  const { expiryDate, autoRenew, noticeWindowDays, renewalNoticeSentAt, renewalDecision } = input;
  const noticeHandled =
    renewalNoticeSentAt != null || renewalDecision !== "UNDECIDED";

  if (!expiryDate) {
    return { urgency: "FUTURE", daysToExpiry: null, noticeDeadline: null, daysToNoticeDeadline: null, noticeHandled };
  }

  const daysToExpiry = daysUntil(now, expiryDate);
  const noticeDeadline =
    noticeWindowDays != null ? new Date(expiryDate.getTime() - noticeWindowDays * DAY_MS) : null;
  const daysToNoticeDeadline = noticeDeadline ? daysUntil(now, noticeDeadline) : null;

  const base = { daysToExpiry, noticeDeadline, daysToNoticeDeadline, noticeHandled };

  if (daysToExpiry < 0) return { urgency: "EXPIRED", ...base };

  // Auto-renewal trap logic — only when the contract will silently renew and
  // no decision/notice has been recorded for this cycle.
  if (autoRenew && daysToNoticeDeadline != null && !noticeHandled) {
    if (daysToNoticeDeadline < 0) return { urgency: "NOTICE_WINDOW_MISSED", ...base };
    if (daysToNoticeDeadline <= noticeSoonDays) return { urgency: "NOTICE_WINDOW_CLOSING", ...base };
  }

  if (daysToExpiry <= expiringSoonDays) return { urgency: "EXPIRING_SOON", ...base };
  if (daysToExpiry <= horizonDays) return { urgency: "UPCOMING", ...base };
  return { urgency: "FUTURE", ...base };
}

export interface RenewalPipelineRow {
  contractId: string;
  title: string;
  type: string;
  status: string;
  counterpartyName: string | null;
  value: number | null;
  currency: string;
  expiryDate: string | null;
  daysToExpiry: number | null;
  autoRenew: boolean;
  noticeWindowDays: number | null;
  noticeDeadline: string | null;
  daysToNoticeDeadline: number | null;
  urgency: RenewalUrgency;
  urgencyRank: number;
  renewalDecision: RenewalDecision;
  renewalDecisionAt: string | null;
  renewalNoticeSentAt: string | null;
  renewalTermMonths: number | null;
  renewalCount: number;
}

export interface RenewalPipeline {
  rows: RenewalPipelineRow[];
  buckets: Record<RenewalUrgency, number>;
  totals: {
    inPipeline: number;
    autoRenewTraps: number; // closing + missed — the "act now" set
    expiringSoon: number;
    expired: number;
  };
  horizonDays: number;
  generatedAt: string;
}

/**
 * The renewal command center feed. Every live contract with an expiry, bucketed
 * by urgency, most-urgent first. FUTURE (beyond the horizon, no imminent notice)
 * contracts are excluded from rows but still counted so the header is honest.
 */
export async function getRenewalPipeline(
  organizationId: string,
  horizons: RenewalHorizons = {},
): Promise<RenewalPipeline> {
  const now = new Date();
  const horizonDays = horizons.horizonDays ?? DEFAULT_HORIZON_DAYS;

  const contracts = await prisma.contract.findMany({
    where: { organizationId, status: { in: [...LIVE_STATUSES] }, expiryDate: { not: null } },
    include: { counterparty: { select: { name: true } } },
  });

  const buckets: Record<RenewalUrgency, number> = {
    EXPIRED: 0,
    NOTICE_WINDOW_MISSED: 0,
    NOTICE_WINDOW_CLOSING: 0,
    EXPIRING_SOON: 0,
    UPCOMING: 0,
    FUTURE: 0,
  };

  const rows: RenewalPipelineRow[] = [];
  for (const c of contracts) {
    const r = classifyRenewalUrgency(
      {
        status: c.status,
        autoRenew: c.autoRenew,
        expiryDate: c.expiryDate,
        noticeWindowDays: c.noticeWindowDays,
        renewalNoticeSentAt: c.renewalNoticeSentAt,
        renewalDecision: c.renewalDecision,
      },
      now,
      horizons,
    );
    buckets[r.urgency] += 1;
    if (r.urgency === "FUTURE") continue; // counted, not listed

    rows.push({
      contractId: c.id,
      title: c.title,
      type: c.type,
      status: c.status,
      counterpartyName: c.counterparty?.name ?? null,
      value: c.value ?? null,
      currency: c.currency,
      expiryDate: c.expiryDate ? c.expiryDate.toISOString() : null,
      daysToExpiry: r.daysToExpiry,
      autoRenew: c.autoRenew,
      noticeWindowDays: c.noticeWindowDays,
      noticeDeadline: r.noticeDeadline ? r.noticeDeadline.toISOString() : null,
      daysToNoticeDeadline: r.daysToNoticeDeadline,
      urgency: r.urgency,
      urgencyRank: RENEWAL_URGENCY_RANK[r.urgency],
      renewalDecision: c.renewalDecision,
      renewalDecisionAt: c.renewalDecisionAt ? c.renewalDecisionAt.toISOString() : null,
      renewalNoticeSentAt: c.renewalNoticeSentAt ? c.renewalNoticeSentAt.toISOString() : null,
      renewalTermMonths: c.renewalTermMonths,
      renewalCount: c.renewalCount,
    });
  }

  rows.sort((a, b) => a.urgencyRank - b.urgencyRank || (a.daysToExpiry ?? 1e9) - (b.daysToExpiry ?? 1e9));

  return {
    rows,
    buckets,
    totals: {
      inPipeline: rows.length,
      autoRenewTraps: buckets.NOTICE_WINDOW_CLOSING + buckets.NOTICE_WINDOW_MISSED,
      expiringSoon: buckets.EXPIRING_SOON,
      expired: buckets.EXPIRED,
    },
    horizonDays,
    generatedAt: now.toISOString(),
  };
}

/** Infer a renewal term (months) from the current term length, default 12. */
export function inferRenewalTermMonths(effectiveDate: Date | null, expiryDate: Date | null): number {
  if (!effectiveDate || !expiryDate) return 12;
  const months =
    (expiryDate.getFullYear() - effectiveDate.getFullYear()) * 12 +
    (expiryDate.getMonth() - effectiveDate.getMonth());
  return months >= 1 ? months : 12;
}

export interface RecordRenewalDecisionInput {
  decision: Exclude<RenewalDecision, "UNDECIDED">;
  reason?: string | null;
  /** Renewal term length (months) — used on RENEW to roll expiry forward. */
  termMonths?: number | null;
}

/**
 * Record the GC's explicit renewal decision for a contract's current cycle,
 * chain-sealed. RENEW rolls expiryDate forward one term, stamps renewedAt,
 * increments renewalCount, and re-arms the next cycle (decision back to
 * UNDECIDED, notice cleared). RENEGOTIATE / NON_RENEWAL record intent only.
 */
export async function recordRenewalDecision(
  organizationId: string,
  contractId: string,
  input: RecordRenewalDecisionInput,
  actor: Actor,
) {
  const existing = await prisma.contract.findFirst({ where: { id: contractId, organizationId } });
  if (!existing) throw new Error("Contract not found");

  const now = new Date();
  const before = { renewalDecision: existing.renewalDecision, expiryDate: existing.expiryDate?.toISOString() ?? null };

  let data: Record<string, unknown>;
  if (input.decision === "RENEW") {
    const termMonths =
      input.termMonths ?? existing.renewalTermMonths ?? inferRenewalTermMonths(existing.effectiveDate, existing.expiryDate);
    const from = existing.expiryDate ?? now;
    const newExpiry = addMonths(from, termMonths);
    data = {
      expiryDate: newExpiry,
      renewedAt: now,
      renewalCount: existing.renewalCount + 1,
      renewalTermMonths: termMonths,
      // Re-arm: the rolled-forward cycle starts fresh and undecided so the next
      // notice window re-prompts. renewalCount / renewedAt carry the history.
      renewalDecision: "UNDECIDED",
      renewalDecisionAt: null,
      renewalDecisionById: null,
      renewalNoticeSentAt: null,
    };
  } else {
    data = {
      renewalDecision: input.decision,
      renewalDecisionAt: now,
      renewalDecisionById: actor.id,
    };
  }

  const updated = await prisma.contract.update({ where: { id: contractId }, data: data as never });

  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.renewal.decision",
    resourceType: "Contract",
    resourceId: contractId,
    beforeJson: before as never,
    afterJson: {
      decision: input.decision,
      reason: input.reason ?? null,
      newExpiryDate: updated.expiryDate?.toISOString() ?? null,
      renewalCount: updated.renewalCount,
    } as never,
    metadata: { source: "contracts" } as never,
  });

  return updated;
}

/**
 * Stamp that the (non-)renewal notice was issued and close the matching open
 * RENEWAL_NOTICE obligation. Chain-sealed. Real delivery (email/mail) is a
 * separate surface — this records the defensible fact that notice was given.
 */
export async function markRenewalNoticeSent(organizationId: string, contractId: string, actor: Actor) {
  const existing = await prisma.contract.findFirst({ where: { id: contractId, organizationId }, select: { id: true } });
  if (!existing) throw new Error("Contract not found");
  const now = new Date();

  const updated = await prisma.contract.update({
    where: { id: contractId },
    data: { renewalNoticeSentAt: now },
  });

  await logAudit({
    organizationId,
    ...actorFields(actor),
    action: "contract.renewal.notice_sent",
    resourceType: "Contract",
    resourceId: contractId,
    afterJson: { sentAt: now.toISOString() } as never,
    metadata: { source: "contracts" } as never,
  });

  // Close the open notice obligation, if one exists — sending the notice IS
  // fulfilling it. Best-effort.
  const noticeObligation = await prisma.obligation.findFirst({
    where: {
      organizationId,
      sourceType: "CONTRACT",
      sourceId: contractId,
      type: "RENEWAL_NOTICE",
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    select: { id: true },
  });
  if (noticeObligation) {
    await updateObligationStatus(organizationId, noticeObligation.id, "MET", actor, {
      reason: "Renewal notice sent",
    }).catch((err) => console.error("[contracts] close notice obligation failed:", err));
  }

  return updated;
}

export interface EnsureNoticeObligationsResult {
  scanned: number;
  created: number;
  createdObligationIds: string[];
  asOf: string;
}

/**
 * Auto-create a RENEWAL_NOTICE obligation for each auto-renew contract whose
 * notice deadline is approaching (within horizon) and not yet decided/sent, so
 * the deadline lives in the shared obligation ledger and the alerts surface —
 * not just in this pipeline read. Idempotent: skips contracts that already have
 * an open RENEWAL_NOTICE obligation. pg-boss-ready (idempotent, structured
 * result); today it runs via an admin HTTP trigger, same pattern as the
 * obligation-breach sweep and the 4c.5 defensibility jobs.
 */
export async function ensureRenewalNoticeObligations(
  organizationId: string,
  opts: { horizonDays?: number } = {},
): Promise<EnsureNoticeObligationsResult> {
  const now = new Date();
  const horizonDays = opts.horizonDays ?? DEFAULT_NOTICE_OBLIGATION_HORIZON_DAYS;

  const contracts = await prisma.contract.findMany({
    where: {
      organizationId,
      status: { in: [...LIVE_STATUSES] },
      autoRenew: true,
      noticeWindowDays: { not: null },
      expiryDate: { not: null },
    },
    select: {
      id: true,
      title: true,
      expiryDate: true,
      noticeWindowDays: true,
      renewalNoticeSentAt: true,
      renewalDecision: true,
      renewalTermMonths: true,
      effectiveDate: true,
    },
  });

  const createdObligationIds: string[] = [];
  for (const c of contracts) {
    if (!c.expiryDate || c.noticeWindowDays == null) continue;
    // Already decided / noticed this cycle → no reminder needed.
    if (c.renewalNoticeSentAt || c.renewalDecision !== "UNDECIDED") continue;

    const noticeDeadline = new Date(c.expiryDate.getTime() - c.noticeWindowDays * DAY_MS);
    const daysToDeadline = daysUntil(now, noticeDeadline);
    // Approaching (within horizon) and the contract hasn't expired yet.
    if (daysToDeadline > horizonDays) continue;
    if (daysUntil(now, c.expiryDate) < 0) continue;

    // Idempotence: skip if an open notice obligation already exists.
    const existing = await prisma.obligation.findFirst({
      where: {
        organizationId,
        sourceType: "CONTRACT",
        sourceId: c.id,
        type: "RENEWAL_NOTICE",
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
      select: { id: true },
    });
    if (existing) continue;

    const termMonths = c.renewalTermMonths ?? inferRenewalTermMonths(c.effectiveDate, c.expiryDate);
    const deadlineLabel = noticeDeadline.toISOString().slice(0, 10);
    const created = await createObligation(
      organizationId,
      c.id,
      {
        description: `Send non-renewal notice for "${c.title}" by ${deadlineLabel} — auto-renews ${termMonths} months otherwise.`,
        dueDate: noticeDeadline,
        type: "RENEWAL_NOTICE",
      },
      { id: null, type: "SYSTEM" },
    );
    createdObligationIds.push(created.id);
  }

  return {
    scanned: contracts.length,
    created: createdObligationIds.length,
    createdObligationIds,
    asOf: now.toISOString(),
  };
}
