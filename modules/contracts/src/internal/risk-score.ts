/**
 * Deterministic per-clause deviation scoring → contract risk score
 * (CLM Phase 3c).
 *
 * Pure, no DB, no AI. The stored `Contract.risk` enum is a single coarse
 * badge; this derives a granular 0-100 score from the actual clause set —
 * each clause weighted by its risk level and whether it deviates from the
 * playbook — so the repository and the drill-in can rank contracts by how
 * much risk their paper actually carries, and name the drivers.
 *
 * Scoring model:
 *   weight(clause) = base(risk) × (deviation ? 2.5 : 1)
 *     base: LOW=1, MEDIUM=2, HIGH=4  →  max single-clause weight = 10.
 *   score = 100 × (0.6 × worstClauseNormalized + 0.4 × averageNormalized)
 *   The 0.6 weight on the single worst clause means ONE severe deviation
 *   drives the score up even when it's buried among benign clauses — the
 *   way a reviewer actually reads risk — while the 0.4 average reflects
 *   overall spread.
 *
 * Null-denominator discipline (same lesson as the 4c.3 defensibility fix):
 * a contract with zero extracted clauses scores `null` / "UNSCORED", never
 * a misleading "LOW", so the UI can render "—".
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "UNSCORED";

export interface ScoredClauseInput {
  type: string;
  risk: RiskLevel;
  deviation: boolean;
}

export interface RiskScoreDriver {
  type: string;
  risk: RiskLevel;
  deviation: boolean;
  /** This clause's weight (1–10), rounded to 1dp — the contribution rank. */
  points: number;
}

export interface ClauseRiskScore {
  /** 0–100, higher = riskier; null when there are no clauses to score. */
  score: number | null;
  band: RiskBand;
  clauseCount: number;
  deviationCount: number;
  breakdown: { high: number; medium: number; low: number };
  /** The clauses pushing the score up, worst first (max 5). */
  drivers: RiskScoreDriver[];
}

const BASE: Record<RiskLevel, number> = { LOW: 1, MEDIUM: 2, HIGH: 4 };
const DEVIATION_MULTIPLIER = 2.5;
const MAX_WEIGHT = BASE.HIGH * DEVIATION_MULTIPLIER; // 10

const clauseWeight = (c: ScoredClauseInput): number =>
  (BASE[c.risk] ?? BASE.LOW) * (c.deviation ? DEVIATION_MULTIPLIER : 1);

/** Band thresholds on the 0–100 score. */
export function bandForScore(score: number | null): RiskBand {
  if (score == null) return "UNSCORED";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

/**
 * Score a contract's clause set. Deterministic and total — safe to call on
 * an empty array (returns `score: null`, `band: "UNSCORED"`).
 */
export function scoreContractClauses(clauses: ScoredClauseInput[]): ClauseRiskScore {
  const breakdown = { high: 0, medium: 0, low: 0 };
  let deviationCount = 0;
  for (const c of clauses) {
    if (c.risk === "HIGH") breakdown.high++;
    else if (c.risk === "MEDIUM") breakdown.medium++;
    else breakdown.low++;
    if (c.deviation) deviationCount++;
  }

  if (clauses.length === 0) {
    return { score: null, band: "UNSCORED", clauseCount: 0, deviationCount: 0, breakdown, drivers: [] };
  }

  const weights = clauses.map(clauseWeight);
  const maxWeight = Math.max(...weights);
  const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
  const normalizedMax = maxWeight / MAX_WEIGHT;
  const normalizedAvg = avgWeight / MAX_WEIGHT;
  const raw = 0.6 * normalizedMax + 0.4 * normalizedAvg;
  const score = Math.round(100 * Math.min(1, raw));

  const drivers: RiskScoreDriver[] = clauses
    .map((c) => ({ type: c.type, risk: c.risk, deviation: c.deviation, points: Math.round(clauseWeight(c) * 10) / 10 }))
    .filter((d) => d.deviation || d.risk !== "LOW")
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  return { score, band: bandForScore(score), clauseCount: clauses.length, deviationCount, breakdown, drivers };
}
