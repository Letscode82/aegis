/**
 * Pure contract-derivation helpers (no DB). Kept separate from reads.ts
 * so the repository maths — expiry windows, clause-risk rollup, overdue
 * detection — is unit-tested without a database.
 */
export type ContractRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type ExpiryBucket = "none" | "expired" | "expiring" | "ok";

const DAY_MS = 86_400_000;

/** Whole days from `now` to `expiry` (negative once expired). */
export function daysToExpiry(now: Date, expiry: Date | null | undefined): number | null {
  if (!expiry) return null;
  return Math.round((expiry.getTime() - now.getTime()) / DAY_MS);
}

/** Bucket a contract by how close it is to expiry (default window 90d). */
export function expiryBucket(days: number | null, windowDays = 90): ExpiryBucket {
  if (days == null) return "none";
  if (days < 0) return "expired";
  if (days <= windowDays) return "expiring";
  return "ok";
}

/** An obligation is overdue when its due date has passed and it is still open. */
export function obligationOverdue(
  dueDate: Date | null | undefined,
  status: string,
  now: Date,
): boolean {
  if (!dueDate) return false;
  if (status !== "OPEN" && status !== "IN_PROGRESS") return false;
  return dueDate.getTime() < now.getTime();
}

/**
 * Roll a contract's clauses up to a single posture: the highest clause
 * risk present, and how many deviate from the playbook. HIGH beats
 * MEDIUM beats LOW; an empty clause set is LOW / zero deviations.
 */
export function rollupClauseRisk(
  clauses: { risk: string; deviation: boolean }[],
): { risk: ContractRiskLevel; deviationCount: number } {
  let risk: ContractRiskLevel = "LOW";
  let deviationCount = 0;
  for (const c of clauses) {
    if (c.deviation) deviationCount++;
    if (c.risk === "HIGH") risk = "HIGH";
    else if (c.risk === "MEDIUM" && risk !== "HIGH") risk = "MEDIUM";
  }
  return { risk, deviationCount };
}
