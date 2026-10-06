/**
 * W2-1 · Complexity signal (issue #108) — pure derivation of a
 * three-band complexity from the classifier/agent triage output.
 *
 * The bands drive tier routing (`matchComplexity` rule condition):
 * "a demand letter scores complex → senior pool; a template NDA scores
 * simple → Tier-1." Deterministic and unit-tested; no DB, no network.
 *
 * Heuristic (from the signals every triage already carries):
 *   - complex : Critical/High risk, or estimated effort ≥ 8h
 *   - simple  : None/Low risk AND confidence ≥ 90 AND effort ≤ 2h
 *   - standard: everything else (also the fallback when no triage ran)
 */

export const COMPLEXITY_BANDS = ["simple", "standard", "complex"] as const;
export type ComplexityBand = (typeof COMPLEXITY_BANDS)[number];

export interface TriageSignal {
  /** e.g. "High — Board-level exposure" (band word leads the string). */
  riskFlag?: string | null;
  /** Classifier confidence 0–100. */
  confidence?: number | null;
  /** Estimated effort hours. */
  estimatedHours?: number | null;
}

export function deriveComplexity(triage: TriageSignal | null | undefined): ComplexityBand {
  if (!triage) return "standard";
  const risk = String(triage.riskFlag ?? "").toLowerCase();
  const conf = typeof triage.confidence === "number" ? triage.confidence : 0;
  const hrs = typeof triage.estimatedHours === "number" ? triage.estimatedHours : 0;

  if (/^\s*(critical|high)/.test(risk) || hrs >= 8) return "complex";
  if (/^\s*(none|low)/.test(risk) && conf >= 90 && hrs <= 2) return "simple";
  return "standard";
}

export function isComplexityBand(v: unknown): v is ComplexityBand {
  return typeof v === "string" && (COMPLEXITY_BANDS as readonly string[]).includes(v);
}
