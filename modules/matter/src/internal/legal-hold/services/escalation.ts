/**
 * Escalation evaluator. Pure helper: given a custodian's overdue
 * status and the resolved escalation chain, returns the next tier
 * to fire. The pg-boss handler in chunk 4 wires this into a
 * scheduled job that emits ESCALATED LegalHoldEvent rows.
 */
import type { ResolvedHoldPolicy } from "../types";

export interface EscalationDecision {
  tier: number;
  notifyRoleNames: string[];
  rationale: string;
}

/**
 * Returns the highest tier whose `afterDays` <= overdueDays. Returns
 * `null` if no tier yet applies (custodian is overdue but inside the
 * first tier's threshold).
 */
export function decideEscalation(
  policy: ResolvedHoldPolicy,
  daysOverdue: number,
): EscalationDecision | null {
  // Sort defensively — the policy could have been written out of
  // order by an admin.
  const sorted = [...policy.escalationChain].sort(
    (a, b) => a.afterDays - b.afterDays,
  );
  let chosen: typeof sorted[number] | null = null;
  for (const tier of sorted) {
    if (daysOverdue >= tier.afterDays) chosen = tier;
  }
  if (!chosen) return null;
  return {
    tier: chosen.level,
    notifyRoleNames: chosen.notifyRoleNames,
    rationale: `Tier ${chosen.level}: ${daysOverdue} days overdue exceeds threshold ${chosen.afterDays}.`,
  };
}
