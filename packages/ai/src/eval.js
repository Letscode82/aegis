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
