/**
 * @aegis/validation — shared review-validation math.
 *
 * The "meet-and-confer binder" / DSAR defensibility numbers from one code
 * path: how well an AI first pass matched the human decisions (recall /
 * precision with Wilson confidence intervals), how often humans overturned the
 * model (overturn rate), and a stratified sample selector for blind
 * re-review. All pure — no I/O — so DSAR review and eDiscovery review both
 * compute the same, testable statistics.
 */

/** One coded item: what the AI predicted vs. what the human decided. */
export interface CodedItem {
  /** AI called it in-scope / relevant / responsive. */
  predictedPositive: boolean;
  /** Human's authoritative decision. */
  actualPositive: boolean;
}

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a binomial proportion (better than normal
 * approximation for small n / extreme p). z defaults to 1.96 (95%).
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: round4(Math.max(0, center - margin)), high: round4(Math.min(1, center + margin)) };
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export interface ConfusionMatrix {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
}

export function confusionMatrix(items: CodedItem[]): ConfusionMatrix {
  const m: ConfusionMatrix = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const it of items) {
    if (it.predictedPositive && it.actualPositive) m.tp += 1;
    else if (it.predictedPositive && !it.actualPositive) m.fp += 1;
    else if (!it.predictedPositive && it.actualPositive) m.fn += 1;
    else m.tn += 1;
  }
  return m;
}

export interface ValidationMetrics {
  n: number;
  matrix: ConfusionMatrix;
  /** TP / (TP + FN) — of all truly-relevant, how many the AI caught. Null when undefined. */
  recall: number | null;
  recallCI: Interval | null;
  /** TP / (TP + FP) — of all AI-flagged, how many were truly relevant. Null when undefined. */
  precision: number | null;
  precisionCI: Interval | null;
  /** Harmonic mean of recall + precision. Null when either is undefined. */
  f1: number | null;
}

/** Recall / precision / F1 with Wilson CIs from coded items (pure). */
export function recallPrecision(items: CodedItem[]): ValidationMetrics {
  const matrix = confusionMatrix(items);
  const { tp, fp, fn } = matrix;
  const recallDenom = tp + fn;
  const precisionDenom = tp + fp;
  const recall = recallDenom > 0 ? round4(tp / recallDenom) : null;
  const precision = precisionDenom > 0 ? round4(tp / precisionDenom) : null;
  const f1 = recall != null && precision != null && recall + precision > 0 ? round4((2 * recall * precision) / (recall + precision)) : null;
  return {
    n: items.length,
    matrix,
    recall,
    recallCI: recallDenom > 0 ? wilsonInterval(tp, recallDenom) : null,
    precision,
    precisionCI: precisionDenom > 0 ? wilsonInterval(tp, precisionDenom) : null,
    f1,
  };
}

export interface OverturnResult {
  total: number;
  overturned: number;
  rate: number | null;
}

/** Fraction of coded items where the human decision differed from the AI. */
export function overturnRate(items: CodedItem[]): OverturnResult {
  let overturned = 0;
  for (const it of items) if (it.predictedPositive !== it.actualPositive) overturned += 1;
  return { total: items.length, overturned, rate: items.length > 0 ? round4(overturned / items.length) : null };
}

/**
 * Deterministic stratified sample: partition by `keyFn`, then take a
 * proportional, evenly-spaced slice from each stratum up to `sampleSize`
 * total. Deterministic (no RNG) so validation runs are reproducible; input
 * order defines the spacing.
 */
export function stratifiedSample<T>(items: T[], keyFn: (item: T) => string, sampleSize: number): T[] {
  if (sampleSize <= 0 || items.length === 0) return [];
  if (sampleSize >= items.length) return [...items];

  const strata = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const arr = strata.get(k);
    if (arr) arr.push(it); else strata.set(k, [it]);
  }

  const out: T[] = [];
  const entries = [...strata.entries()];
  for (const [, group] of entries) {
    const quota = Math.max(1, Math.round((group.length / items.length) * sampleSize));
    const step = group.length / quota;
    for (let i = 0; i < quota && out.length < sampleSize; i++) {
      const idx = Math.min(group.length - 1, Math.floor(i * step));
      out.push(group[idx]!);
    }
  }
  return out.slice(0, sampleSize);
}
