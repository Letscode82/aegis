/**
 * Classifier evaluation harness (EVAL1).
 *
 * A tiny, dependency-free eval seam: run a set of labeled cases through a
 * classify function and report accuracy + the exact failures. Deterministic and
 * API-free when pointed at `classifyIntakeRegex`, so it runs in CI as a
 * regression guard on classification quality. The same shape can later wrap a
 * Claude-backed classifier for offline scoring.
 *
 * A case: { text, dept?, expected }  where `expected` is the category string
 * (the classifier's `cat`) or null for "should not classify".
 */

/**
 * @param {Array<{text:string, dept?:string, expected:string|null}>} cases
 * @param {(text:string, dept?:string) => ({cat?:string}|null)} classifyFn
 * @returns {{ total:number, correct:number, accuracy:number,
 *             failures:Array<{text:string, expected:string|null, got:string|null}>}}
 */
export function evaluateClassifier(cases, classifyFn) {
  const list = Array.isArray(cases) ? cases : [];
  const failures = [];
  let correct = 0;
  for (const c of list) {
    let got = null;
    try {
      const r = classifyFn(c.text, c.dept);
      got = r && typeof r === "object" && typeof r.cat === "string" ? r.cat : null;
    } catch {
      got = null;
    }
    if (got === c.expected) correct += 1;
    else failures.push({ text: c.text, expected: c.expected, got });
  }
  const total = list.length;
  const accuracy = total === 0 ? 1 : correct / total;
  return { total, correct, accuracy, failures };
}

// ── General eval harness (EVAL2) ─────────────────────────────────────
//
// `evaluateClassifier` above is a single-purpose exact-match eval. This is the
// general version: run any set of labeled cases through a `runFn`, score each
// with a pluggable `scoreFn`, and get pass-rate + mean-score + the exact
// failures. Deterministic and API-free when `runFn` points at a deterministic
// engine (our regex extractor, the risk scorer, the review grader), so it runs
// in CI as a regression guard on AI QUALITY — not just output shape. The same
// shape wraps a real Claude call for offline / nightly scoring when a key is
// present (the runFn just becomes async; use runEvalSuiteAsync).
//
// A case: { name?, input, expected, ...anything the scoreFn needs }.
// A scoreFn: (expected, got, case) => { pass: boolean, score?: number 0..1, detail?: string }.
//   `score` defaults to 1 when pass, 0 otherwise.

/** @typedef {{ pass: boolean, score?: number, detail?: string, [k:string]: unknown }} CaseScore */

function normalizeScore(s) {
  if (!s || typeof s !== "object") return { pass: false, score: 0 };
  const pass = !!s.pass;
  const score = typeof s.score === "number" && Number.isFinite(s.score)
    ? Math.max(0, Math.min(1, s.score))
    : (pass ? 1 : 0);
  return { ...s, pass, score };
}

/**
 * Run a synchronous eval suite.
 * @param {Array<object>} cases
 * @param {(c:object) => unknown} runFn produces the actual output for a case
 * @param {(expected:unknown, got:unknown, c:object) => CaseScore} scoreFn
 * @returns {{ total:number, passed:number, passRate:number, meanScore:number,
 *             results:Array<object>, failures:Array<object> }}
 */
export function runEvalSuite(cases, runFn, scoreFn) {
  const list = Array.isArray(cases) ? cases : [];
  const results = [];
  let passed = 0, scoreSum = 0;
  for (const c of list) {
    let got = null, error = null;
    try { got = runFn(c); } catch (e) { error = String((e && e.message) || e); }
    const s = error ? { pass: false, score: 0, detail: `threw: ${error}` } : normalizeScore(scoreFn(c.expected, got, c));
    if (s.pass) passed += 1;
    scoreSum += s.score;
    results.push({ name: c.name ?? null, expected: c.expected, got, pass: s.pass, score: s.score, detail: s.detail ?? null, error });
  }
  const total = list.length;
  return {
    total,
    passed,
    passRate: total === 0 ? 1 : passed / total,
    meanScore: total === 0 ? 1 : scoreSum / total,
    results,
    failures: results.filter((r) => !r.pass),
  };
}

/** Async variant — `runFn` may return a Promise (e.g. a real Claude call). */
export async function runEvalSuiteAsync(cases, runFn, scoreFn) {
  const list = Array.isArray(cases) ? cases : [];
  const results = [];
  let passed = 0, scoreSum = 0;
  for (const c of list) {
    let got = null, error = null;
    try { got = await runFn(c); } catch (e) { error = String((e && e.message) || e); }
    const s = error ? { pass: false, score: 0, detail: `threw: ${error}` } : normalizeScore(scoreFn(c.expected, got, c));
    if (s.pass) passed += 1;
    scoreSum += s.score;
    results.push({ name: c.name ?? null, expected: c.expected, got, pass: s.pass, score: s.score, detail: s.detail ?? null, error });
  }
  const total = list.length;
  return {
    total, passed,
    passRate: total === 0 ? 1 : passed / total,
    meanScore: total === 0 ? 1 : scoreSum / total,
    results,
    failures: results.filter((r) => !r.pass),
  };
}

// ── Scoring strategies ───────────────────────────────────────────────

/** Exact equality. */
export function exactScore(expected, got) {
  return { pass: expected === got, score: expected === got ? 1 : 0 };
}

/**
 * Set-overlap score over two arrays (order-insensitive). Recall = how much of
 * `expected` was found; precision = how much of `got` was wanted; F1 balances
 * them. Pass requires full recall by default, and full precision too when
 * `requirePrecision` is set.
 * @param {{ key?: (x:unknown)=>string, requirePrecision?: boolean, minRecall?: number, minPrecision?: number }} [opts]
 */
export function setScore(expectedArr, gotArr, opts = {}) {
  const key = opts.key || ((x) => String(x));
  const exp = new Set((Array.isArray(expectedArr) ? expectedArr : []).map(key));
  const got = new Set((Array.isArray(gotArr) ? gotArr : []).map(key));
  let tp = 0;
  for (const g of got) if (exp.has(g)) tp += 1;
  const recall = exp.size === 0 ? 1 : tp / exp.size;
  const precision = got.size === 0 ? (exp.size === 0 ? 1 : 0) : tp / got.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const missing = [...exp].filter((e) => !got.has(e));
  const extra = [...got].filter((g) => !exp.has(g));
  const minRecall = opts.minRecall ?? 1;
  const minPrecision = opts.requirePrecision ? (opts.minPrecision ?? 1) : 0;
  const pass = recall >= minRecall && precision >= minPrecision;
  const detail = missing.length || extra.length
    ? `recall=${recall.toFixed(2)} precision=${precision.toFixed(2)}${missing.length ? ` missing=[${missing.join(",")}]` : ""}${extra.length ? ` extra=[${extra.join(",")}]` : ""}`
    : undefined;
  return { pass, score: opts.requirePrecision ? f1 : recall, detail, recall, precision, f1 };
}

/**
 * Ordinal-label score with optional adjacency tolerance. With `order` given
 * (e.g. ["LOW","MEDIUM","HIGH"]), `tolerance:1` counts an adjacent band as a
 * partial (0.5) credit but not a pass. Exact label always passes.
 * @param {{ order?: string[], tolerance?: number }} [opts]
 */
export function labelScore(expected, got, opts = {}) {
  if (expected === got) return { pass: true, score: 1 };
  const order = opts.order;
  const tol = opts.tolerance ?? 0;
  if (order && tol > 0) {
    const ei = order.indexOf(expected);
    const gi = order.indexOf(got);
    if (ei >= 0 && gi >= 0 && Math.abs(ei - gi) <= tol) {
      return { pass: false, score: 0.5, detail: `off-by-${Math.abs(ei - gi)}: expected ${expected}, got ${got}` };
    }
  }
  return { pass: false, score: 0, detail: `expected ${expected}, got ${String(got)}` };
}

/** Assert a report meets its bar — throws a readable error listing failures.
 *  Use inside a vitest `it(...)` so a quality regression fails the build. */
export function assertEvalThreshold(report, { minPassRate = 1, minMeanScore = 0, label = "eval" } = {}) {
  const okPass = report.passRate >= minPassRate - 1e-9;
  const okMean = report.meanScore >= minMeanScore - 1e-9;
  if (okPass && okMean) return;
  const lines = report.failures.map((f) => `  ✗ ${f.name ?? "(case)"} — ${f.detail ?? `expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.got)}`}`);
  throw new Error(
    `${label}: passRate ${report.passRate.toFixed(3)} (min ${minPassRate}), ` +
    `meanScore ${report.meanScore.toFixed(3)} (min ${minMeanScore}); ` +
    `${report.failures.length}/${report.total} failed\n${lines.join("\n")}`,
  );
}

/** One-line-per-case human report (for a script / nightly runner). */
export function formatEvalReport(report, title = "Eval") {
  const head = `${title}: ${report.passed}/${report.total} passed · passRate ${report.passRate.toFixed(3)} · meanScore ${report.meanScore.toFixed(3)}`;
  const rows = report.results.map((r) => `${r.pass ? "✓" : "✗"} ${r.name ?? "(case)"}${r.detail ? ` — ${r.detail}` : ""}`);
  return [head, ...rows].join("\n");
}
