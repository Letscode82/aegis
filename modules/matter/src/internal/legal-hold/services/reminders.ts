/**
 * Reminder + re-attestation scheduling (sub-PR 4b chunk 4 fills the
 * pg-boss handlers; this file ships the data-layer side first so
 * commit 5's API + commit 6's UI have stable functions to call).
 *
 * In 4b the scheduling is best-effort: when a hold is issued or a
 * custodian is added, a reminder row is queued. The pg-boss handler
 * runs through `due reminder` rows nightly and:
 *   1. Records a REMINDER_SENT LegalHoldEvent
 *   2. If overdue past escalationChain[level].afterDays, records an
 *      ESCALATED LegalHoldEvent and bumps escalation tier
 *
 * The handler ships in chunk 4. The compute-due helpers below are
 * in this file so the scorecard (chunk 4) and the API (chunk 5) can
 * reason about cadence without duplicating logic.
 */
import { prisma } from "@aegis/db";
import { effectiveCadenceDays, resolveEffectivePolicy } from "./policy";

export interface DueReminder {
  legalHoldCustodianId: string;
  legalHoldId: string;
  personId: string;
  dueAt: Date;
  daysOverdue: number;
}

/**
 * List custodian rows whose nextReAttestationDueAt is within
 * `policy.reminderLeadTimeDays` of `now` OR already past due.
 */
export async function listDueReminders(
  organizationId: string,
  now: Date = new Date(),
): Promise<DueReminder[]> {
  const policy = await resolveEffectivePolicy(organizationId);
  const horizon = new Date(
    now.getTime() + policy.reminderLeadTimeDays * 24 * 60 * 60 * 1000,
  );
  const rows = await prisma.legalHoldCustodian.findMany({
    where: {
      legalHold: { organizationId, status: { in: ["ISSUED", "ACTIVE", "PARTIALLY_RELEASED"] } },
      releasedAt: null,
      nextReAttestationDueAt: { lte: horizon },
    },
    select: {
      id: true,
      legalHoldId: true,
      personId: true,
      nextReAttestationDueAt: true,
    },
  });
  return rows
    .filter((r) => r.nextReAttestationDueAt !== null)
    .map((r) => ({
      legalHoldCustodianId: r.id,
      legalHoldId: r.legalHoldId,
      personId: r.personId,
      dueAt: r.nextReAttestationDueAt!,
      daysOverdue: Math.max(
        0,
        Math.floor((now.getTime() - r.nextReAttestationDueAt!.getTime()) / 86400000),
      ),
    }));
}

/**
 * Compute the effective cadence for a hold. Pure helper used by the
 * scorecard's "re-attestation currency" component and by the
 * reminder scheduler.
 */
export async function effectiveCadenceForHold(
  organizationId: string,
  holdId: string,
): Promise<number> {
  const hold = await prisma.legalHold.findUnique({
    where: { id: holdId },
    select: { jurisdictions: true },
  });
  if (!hold) return 90;
  const policy = await resolveEffectivePolicy(organizationId, holdId);
  return effectiveCadenceDays(policy, hold.jurisdictions);
}
